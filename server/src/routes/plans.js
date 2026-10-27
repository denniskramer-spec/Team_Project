import { Router } from 'express';
import { archiveDeleted } from '../utils/audit.js';
import mongoose from 'mongoose';
import Plan, { PLAN_TYPES, PLAN_STATES, PLAN_ITEMS } from '../models/Plan.js';
import Report from '../models/Report.js';
import Income from '../models/Income.js';
import User from '../models/User.js';
import Group from '../models/Group.js';
import { requireAuth } from '../middleware/auth.js';
import { parsePeriod, periodKey, shiftPeriod } from '../utils/period.js';
import { visibleGroups } from '../utils/scope.js';
import { scopeFilter, canReadTeam, canSeeMember } from '../utils/visibility.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { checkOptionalAmount, checkCount, checkText } from '../utils/validate.js';
import { findGroupRecord, saveGroupRecord, latestPerGroup, canChangeGroupRecord } from '../utils/groupRecords.js';
import { planChanged } from '../socket/events.js';

const router = Router();
router.use(requireAuth);

// Members and bosses plan; bosses also plan for their group.
// The leader and admins read every plan.
const canPlan = (user) => ['member', 'boss'].includes(user.role);
const canPlanGroup = (user) => user.role === 'boss' && Boolean(user.group);

function checkType(type) {
  if (!PLAN_TYPES.includes(type)) throw badRequest('Plans are weekly or monthly');
  return type;
}

function checkFields(body) {
  const fields = { note: checkText(body.note, 'Note', 2000) };
  // Bids, résumés and forms are counted; hours and income are amounts.
  for (const item of PLAN_ITEMS) {
    fields[item.key] = ['income', 'biddingHours'].includes(item.key)
      ? checkOptionalAmount(body[item.key], item.label)
      : checkCount(body[item.key], item.label);
  }
  if (body.status !== undefined) {
    if (!PLAN_STATES.includes(body.status)) throw badRequest('Unknown status');
    fields.status = body.status;
    fields.statusUpdatedAt = new Date();
  }
  return fields;
}

// The targets of a plan; older plans counted bids in one field, shown as applied.
const targetsOf = (p) => Object.fromEntries(PLAN_ITEMS.map((i) => [i.key, i.key === 'jobBid' ? (p.jobBid || p.bid || 0) : (p[i.key] || 0)]));

const serialize = (p, user, achieved = null) => ({
  id: p._id,
  owner: p.owner?._id ? { id: p.owner._id, name: p.owner.name, role: p.owner.role } : null,
  group: p.group?._id ? { id: p.group._id, name: p.group.name, slug: p.group.slug } : null,
  scope: p.scope,
  type: p.type,
  period: p.period,
  ...targetsOf(p),
  targets: targetsOf(p),
  // What the daily reports of the period add up to, per item (null when
  // the reports were not looked up).
  achieved,
  note: p.note,
  status: p.status,
  statusUpdatedAt: p.statusUpdatedAt,
  updatedAt: p.updatedAt,
  // A group plan belongs to its group's bosses, whoever saved it last.
  mine: p.scope === 'group' ? canChangeGroupRecord(user, p) : String(p.owner?._id ?? p.owner) === String(user._id),
});

// Plans this user may read: everything (leader, admin), their group (boss)
// or only their own (member). An optional member filter narrows it further.
async function readFilter(req, groups) {
  const user = req.user;
  const allowed = canReadTeam(user) ? visibleGroups(user, groups) : [];
  const filter = scopeFilter(user, 'owner');

  const groupSlug = req.query.group;
  if (groupSlug && groupSlug !== 'all') {
    const group = allowed.find((g) => g.slug === groupSlug);
    if (!group) throw notFound('Group not found');
    filter.group = group._id;
  }
  if (req.query.member) {
    const member = await User.findById(
      mongoose.isValidObjectId(req.query.member) ? req.query.member : null,
    );
    if (!member || !canSeeMember(user, member)) throw notFound('Member not found');
    filter.owner = member._id;
  }
  return filter;
}

// GET /api/plans?type=weekly&period=2026-W39&group=all|<slug>
router.get('/', async (req, res) => {
  const type = checkType(req.query.type);
  const period = parsePeriod(type, req.query.period || periodKey(type));
  const groups = await Group.find({}, 'name slug').lean();
  const readable = await readFilter(req, groups);
  const base = { type, period: period.key };

  const [mine, myGroupPlan, found] = await Promise.all([
    Plan.findOne({ ...base, owner: req.user._id, scope: 'personal' }).populate('owner', 'name role').populate('group', 'name slug'),
    canPlanGroup(req.user)
      ? findGroupRecord(Plan, { ...base, group: req.user.group }).populate('owner', 'name role').populate('group', 'name slug')
      : null,
    Plan.find({ ...base, ...readable }).populate('owner', 'name role').populate('group', 'name slug').sort('scope'),
  ]);

  // Who is expected to have a plan, so "no plan yet" can be shown.
  const memberFilter = { status: 'active', role: { $in: ['member', 'boss'] } };
  if (readable.group) memberFilter.group = readable.group;
  if (readable.owner) memberFilter._id = readable.owner;
  const members = await User.find(memberFilter, 'name role group').populate('group', 'name slug').sort('name').lean();

  const personal = found.filter((p) => p.scope === 'personal');
  const plans = [...personal, ...latestPerGroup(found.filter((p) => p.scope === 'group'))];
  const byOwner = new Map(personal.map((p) => [String(p.owner._id), p]));

  // Achieved so far: the daily reports of the period, added up per author
  // (for a personal plan) and per group (for a group plan). The income
  // target is met by what Finance records in the period, not by the
  // reports: a report says what the work is worth, Finance says what came in.
  const inside = { $gte: period.start, $lt: period.end };
  const [reports, incomes] = await Promise.all([
    Report.find({
      scope: 'personal', type: 'daily', periodStart: inside,
      ...(readable.group ? { group: readable.group } : {}), ...(readable.owner ? { author: readable.owner } : {}),
    }, [...PLAN_ITEMS.map((i) => i.key), 'bid', 'author', 'group'].join(' ')).lean(),
    Income.find({
      date: inside,
      ...(readable.group ? { group: readable.group } : {}), ...(readable.owner ? { member: readable.owner } : {}),
    }, 'member group amount').lean(),
  ]);
  const sumInto = (acc, r) => { for (const i of PLAN_ITEMS) if (i.key !== 'income') acc[i.key] += i.key === 'jobBid' ? (r.jobBid || r.bid || 0) : (r[i.key] || 0); return acc; };
  const zero = () => Object.fromEntries(PLAN_ITEMS.map((i) => [i.key, 0]));
  const byAuthor = new Map();
  const byGroup = new Map();
  for (const r of reports) {
    byAuthor.set(String(r.author), sumInto(byAuthor.get(String(r.author)) ?? zero(), r));
    if (r.group) byGroup.set(String(r.group), sumInto(byGroup.get(String(r.group)) ?? zero(), r));
  }
  const addIncome = (map, key, amount) => { const acc = map.get(key) ?? zero(); acc.income = Math.round((acc.income + amount) * 100) / 100; map.set(key, acc); };
  for (const i of incomes) {
    addIncome(byAuthor, String(i.member), i.amount || 0);
    if (i.group) addIncome(byGroup, String(i.group), i.amount || 0);
  }
  const achievedOf = (p) => (p.scope === 'group' ? byGroup.get(String(p.group?._id ?? p.group)) : byAuthor.get(String(p.owner?._id ?? p.owner))) ?? zero();
  // Counts and totals cover the same plans: the personal ones.
  const counts = PLAN_STATES.reduce((acc, s) => ({ ...acc, [s]: personal.filter((p) => p.status === s).length }), {});
  // Totals add up personal plans only: a boss's group plan repeats their
  // members' targets (Checkout leaves it out for the same reason).
  const totals = personal.reduce((acc, p) => { const t = targetsOf(p); for (const i of PLAN_ITEMS) acc[i.key] += t[i.key]; return acc; }, zero());
  const achievedTotals = personal.reduce((acc, p) => { const a = achievedOf(p); for (const i of PLAN_ITEMS) acc[i.key] += a[i.key]; return acc; }, zero());

  const nextKey = shiftPeriod(type, period.key, 1);
  res.json({
    period: {
      ...period,
      type,
      prev: shiftPeriod(type, period.key, -1),
      next: nextKey,
      // Planning ahead is allowed, so the next period is always reachable.
      isCurrent: period.key === periodKey(type),
    },
    can: { plan: canPlan(req.user), planGroup: canPlanGroup(req.user) },
    items: PLAN_ITEMS,
    mine: mine ? serialize(mine, req.user, achievedOf(mine)) : null,
    myGroupPlan: myGroupPlan ? serialize(myGroupPlan, req.user, achievedOf(myGroupPlan)) : null,
    plans: plans.map((p) => serialize(p, req.user, achievedOf(p))),
    missing: members
      .filter((m) => !byOwner.has(String(m._id)))
      .map((m) => ({ id: m._id, name: m.name, role: m.role, group: m.group ? { name: m.group.name, slug: m.group.slug } : null })),
    counts,
    totals,
    achievedTotals,
    groups: (canReadTeam(req.user) ? visibleGroups(req.user, groups) : []).map((g) => ({ id: g._id, name: g.name, slug: g.slug })),
    scope: canReadTeam(req.user) ? (req.user.role === 'boss' ? 'group' : 'all') : 'self',
  });
});

// PUT /api/plans — create or update the caller's plan for a period.
router.put('/', async (req, res) => {
  const type = checkType(req.body.type);
  const period = parsePeriod(type, req.body.period || periodKey(type));
  const scope = req.body.scope === 'group' ? 'group' : 'personal';

  if (scope === 'personal' && !canPlan(req.user)) {
    throw forbidden('The team leader and admins read plans but do not write them');
  }
  if (scope === 'group' && !canPlanGroup(req.user)) {
    throw forbidden('Only a boss plans for their own group');
  }

  const fields = { ...checkFields(req.body), periodStart: period.start, periodEnd: period.end };
  const plan = scope === 'group'
    ? await saveGroupRecord(Plan, 'owner', req.user, { type, period: period.key }, fields)
    : await Plan.findOneAndUpdate(
      { owner: req.user._id, type, period: period.key, scope },
      { ...fields, group: req.user.group ?? null },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  await plan.populate('owner', 'name role');
  await plan.populate('group', 'name slug');

  planChanged(req.user, plan);
  res.json({ plan: serialize(plan, req.user) });
});

async function findOwnPlan(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Plan not found');
  const plan = await Plan.findById(req.params.id).populate('owner', 'name role').populate('group', 'name slug');
  if (!plan) throw notFound('Plan not found');
  const allowed = plan.scope === 'group'
    ? canChangeGroupRecord(req.user, plan)
    : String(plan.owner?._id ?? plan.owner) === String(req.user._id);
  if (!allowed) throw forbidden('You can only change your own plan');
  return plan;
}

// PATCH /api/plans/:id/status { status } — done, progress or not_done.
router.patch('/:id/status', async (req, res) => {
  const plan = await findOwnPlan(req);
  if (!PLAN_STATES.includes(req.body.status)) throw badRequest('Status must be not_done, progress or done');
  plan.status = req.body.status;
  plan.statusUpdatedAt = new Date();
  await plan.save();

  planChanged(req.user, plan);
  res.json({ plan: serialize(plan, req.user) });
});

router.delete('/:id', async (req, res) => {
  const plan = await findOwnPlan(req);
  await archiveDeleted(plan, req, { model: 'Plan', label: `${plan.type} plan ${plan.period}` });
  await plan.deleteOne();
  planChanged(req.user, plan);
  res.json({ ok: true });
});

export default router;
