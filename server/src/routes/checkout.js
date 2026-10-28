import { Router } from 'express';
import Plan, { PLAN_STATES } from '../models/Plan.js';
import Report from '../models/Report.js';
import Task from '../models/Task.js';
import Income from '../models/Income.js';
import User from '../models/User.js';
import Group from '../models/Group.js';
import { requireAuth } from '../middleware/auth.js';
import { parsePeriod, periodKey, shiftPeriod } from '../utils/period.js';
import { teamNow } from '../utils/teamTime.js';
import mongoose from 'mongoose';
import { scopeFilter, canReadTeam, canSeeMember } from '../utils/visibility.js';
import { visibleGroups } from '../utils/scope.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { person as personOf, parseDay } from '../utils/finance.js';
import { earnedOf, upcomingOf } from '../utils/reportWork.js';
import { formatPrice } from '../utils/project.js';

const router = Router();
router.use(requireAuth);

// Checkout periods are weekly, monthly and yearly ("annual" internally).
const TYPES = { weekly: 'weekly', monthly: 'monthly', yearly: 'annual' };

const PLAN_FIELDS = 'owner type period periodStart status statusUpdatedAt note income jobBid bid aiBid';
const REPORT_FIELDS = 'author period periodStart sentAt income jobBid bid aiBid work.task work.text work.hours work.count work.amount work.paidBy';
const INCOME_FIELDS = 'member date amount method task from note';

const sum = (rows, field) => rows.reduce((total, row) => total + (row[field] || 0), 0);
// Records written before bids were split counted them all as job bids.
const sumJobBids = (rows) => rows.reduce((total, row) => total + (row.jobBid || row.bid || 0), 0);
// A daily report's income is what its hours and tasks earned (reports written
// before projects had prices typed an income figure in; it still counts).
const money = (n) => Math.round(n * 100) / 100;
const sumEarned = (rows) => money(rows.reduce((total, row) => total + (earnedOf(row.work) || row.income || 0), 0));
const sumUpcoming = (rows) => money(rows.reduce((total, row) => total + upcomingOf(row.work), 0));

// GET /api/checkout?type=weekly|monthly|yearly&period=&group=all|<slug>
// Pulls together the Plan, Report, Task and Finance channels for one period.
// Without ?period=, the current one: around ?date=YYYY-MM-DD when given (the
// client's own calendar day, which is not the server's near midnight).
router.get('/', async (req, res) => {
  const titleType = req.query.type || 'weekly';
  const type = TYPES[titleType];
  if (!type) throw badRequest('Checkout periods are weekly, monthly or yearly');
  const period = parsePeriod(type, req.query.period || periodKey(type, req.query.date ? parseDay(req.query.date, 'date') : undefined));

  // Who the numbers cover: the same role rules as the other channels.
  const owners = scopeFilter(req.user, 'owner');
  const members = scopeFilter(req.user, 'member');
  const authors = scopeFilter(req.user, 'author');

  const groups = await Group.find({}, 'name slug').lean();
  const allowed = canReadTeam(req.user) ? visibleGroups(req.user, groups) : [];
  let groupId = null;
  if (req.query.group && req.query.group !== 'all') {
    const group = allowed.find((g) => g.slug === req.query.group);
    if (!group) throw notFound('Group not found');
    groupId = group._id;
  }
  let memberId = null;
  if (req.query.member) {
    const member = await User.findById(mongoose.isValidObjectId(req.query.member) ? req.query.member : null);
    if (!member || !canSeeMember(req.user, member)) throw notFound('Member not found');
    memberId = member._id;
  }
  const withGroup = (filter, ownerField) => {
    const out = groupId ? { ...filter, group: groupId } : { ...filter };
    if (memberId && ownerField) out[ownerField] = memberId;
    return out;
  };

  // Plans and reports belong to the period they start in, the same rule as
  // Finance: the week of Sep 28 – Oct 4 counts for September, and the last
  // week of a year for that year. A weekly checkout compares weekly plans only.
  const inside = { periodStart: { $gte: period.start, $lt: period.end } };
  const planned = type === 'weekly' ? { ...inside, type: 'weekly' } : inside;

  // Only the fields the sums and the detail dialogs read: a yearly checkout
  // would otherwise pull every daily report's free text.
  const [allPlans, reports, tasks, incomes, current] = await Promise.all([
    // Personal plans only: a boss's group plan repeats their members' targets.
    Plan.find(withGroup({ ...owners, ...planned, scope: 'personal' }, 'owner'), PLAN_FIELDS).lean(),
    Report.find(withGroup({ ...authors, ...inside, scope: 'personal' }, 'author'), REPORT_FIELDS).lean(),
    // Tasks that overlap the period at all.
    Task.find(withGroup({ ...owners, startDate: { $lt: period.end }, $or: [{ endDate: null }, { endDate: { $gte: period.start } }] }, 'owner')).lean(),
    Income.find(withGroup({ ...members, date: { $gte: period.start, $lt: period.end } }, 'member'), INCOME_FIELDS).lean(),
    // The people listed follow the same role rules: a boss sees their group,
    // a member only themselves.
    User.find(withGroup({
      ...scopeFilter(req.user, '_id'),
      status: 'active',
      role: { $in: ['member', 'boss'] },
    }, '_id'), 'name role status group').populate('group', 'name slug').lean(),
  ]);

  // Whoever else owns something counted here (an account since disabled, a
  // member since promoted) gets a row too, so the rows add up to the totals.
  const listed = new Set(current.map((u) => String(u._id)));
  const owners2 = [
    ...allPlans.map((p) => p.owner), ...reports.map((r) => r.author),
    ...tasks.map((t) => t.owner), ...incomes.map((i) => i.member),
  ].map(String).filter((id) => !listed.has(id));
  const others = owners2.length
    ? await User.find({ _id: { $in: [...new Set(owners2)] } }, 'name role status group').populate('group', 'name slug').lean()
    : [];
  const people = [...current, ...others].sort((a, b) => a.name.localeCompare(b.name));

  // A member's monthly plan already covers their weeks, so planned targets
  // count weekly plans only for members with no monthly plan in the period
  // (the same rule as the Finance chart). Plan states still count every plan.
  const idOf = (doc, field) => String(doc[field]?._id ?? doc[field]);
  const withMonthly = new Set(allPlans.filter((p) => p.type === 'monthly').map((p) => idOf(p, 'owner')));
  const plans = allPlans.filter((p) => p.type === 'monthly' || !withMonthly.has(idOf(p, 'owner')));

  // The three bar charts from the guide.
  const income = {
    planned: sum(plans, 'income'),
    reported: sumEarned(reports),
    upcoming: sumUpcoming(reports),
    actual: sum(incomes, 'amount'),
  };
  const jobBid = { planned: sumJobBids(plans), reported: sumJobBids(reports) };
  const aiBid = { planned: sum(plans, 'aiBid'), reported: sum(reports, 'aiBid') };
  const task = {
    done: tasks.filter((t) => t.status === 'done').length,
    total: tasks.length,
    price: sum(tasks, 'price'),
  };

  const planStates = PLAN_STATES.reduce((acc, state) => ({ ...acc, [state]: allPlans.filter((p) => p.status === state).length }), {});

  // Per-member breakdown, so a leader can see who is behind.
  const rows = people.map((person) => {
    const id = String(person._id);
    const mine = {
      plans: plans.filter((p) => idOf(p, 'owner') === id),
      allPlans: allPlans.filter((p) => idOf(p, 'owner') === id),
      reports: reports.filter((r) => idOf(r, 'author') === id),
      tasks: tasks.filter((t) => idOf(t, 'owner') === id),
      incomes: incomes.filter((i) => idOf(i, 'member') === id),
    };
    return {
      member: {
        ...personOf(person),
        group: person.group ? { name: person.group.name, slug: person.group.slug } : null,
      },
      planned: { jobBid: sumJobBids(mine.plans), aiBid: sum(mine.plans, 'aiBid'), income: sum(mine.plans, 'income') },
      reported: { jobBid: sumJobBids(mine.reports), aiBid: sum(mine.reports, 'aiBid'), income: sumEarned(mine.reports) },
      upcoming: sumUpcoming(mine.reports),
      actualIncome: sum(mine.incomes, 'amount'),
      tasks: { total: mine.tasks.length, done: mine.tasks.filter((t) => t.status === 'done').length, price: sum(mine.tasks, 'price') },
      planStates: PLAN_STATES.reduce((acc, s) => ({ ...acc, [s]: mine.allPlans.filter((p) => p.status === s).length }), {}),
    };
  });

  // The records behind each card, for the detail dialogs: every plan, report,
  // income record and project the numbers above add up.
  const personById = new Map(people.map((p) => [String(p._id), personOf(p)]));
  const who = (doc, field) => personById.get(idOf(doc, field)) ?? null;
  const taskNames = new Map(tasks.map((t) => [String(t._id), t.name]));
  const wanted = new Set([
    ...incomes.map((i) => i.task).filter(Boolean).map(String),
    ...reports.flatMap((r) => (r.work ?? []).map((w) => String(w.task))),
  ]);
  const missingTasks = [...wanted].filter((id) => !taskNames.has(id));
  if (missingTasks.length) {
    (await Task.find({ _id: { $in: missingTasks } }, 'name').lean()).forEach((t) => taskNames.set(String(t._id), t.name));
  }
  const counted = new Set(plans.map((p) => String(p._id)));
  const details = {
    plans: allPlans.map((p) => ({
      id: p._id, member: who(p, 'owner'), type: p.type, period: p.period, label: parsePeriod(p.type, p.period).label,
      status: p.status, statusUpdatedAt: p.statusUpdatedAt ?? null, note: p.note ?? '',
      income: p.income || 0, jobBid: p.jobBid || p.bid || 0, aiBid: p.aiBid || 0,
      // A weekly plan under a monthly one is not added to the targets.
      counted: counted.has(String(p._id)),
    })).sort((a, b) => (a.member?.name ?? '').localeCompare(b.member?.name ?? '') || a.period.localeCompare(b.period)),
    reports: reports.map((r) => ({
      id: r._id, member: who(r, 'author'), period: r.period, date: r.periodStart, sent: Boolean(r.sentAt),
      jobBid: r.jobBid || r.bid || 0, aiBid: r.aiBid || 0,
      earned: money(earnedOf(r.work) || r.income || 0), upcoming: money(upcomingOf(r.work)),
      projects: (r.work ?? []).filter((w) => w.text?.trim() || w.hours || w.count).map((w) => taskNames.get(String(w.task)) ?? 'Project'),
    })).sort((a, b) => b.date - a.date),
    incomes: incomes.map((i) => ({
      id: i._id, member: who(i, 'member'), date: i.date, amount: i.amount, method: i.method,
      from: (i.task && taskNames.get(String(i.task))) || i.from || '', note: i.note ?? '',
    })).sort((a, b) => b.date - a.date),
    tasks: tasks.map((t) => ({
      id: t._id, member: who(t, 'owner'), name: t.name, status: t.status, source: t.source ?? '',
      price: t.price || 0, priceLabel: formatPrice(t), startDate: t.startDate, endDate: t.endDate ?? null,
    })).sort((a, b) => b.startDate - a.startDate),
  };

  const nextKey = shiftPeriod(type, period.key, 1);
  res.json({
    details,
    period: {
      ...period,
      type: titleType,
      prev: shiftPeriod(type, period.key, -1),
      next: nextKey,
      hasNext: parsePeriod(type, nextKey).start <= teamNow(),
      isCurrent: period.key === periodKey(type),
    },
    income,
    jobBid,
    aiBid,
    task,
    planStates,
    rows,
    counts: { plans: allPlans.length, reports: reports.length, tasks: tasks.length, incomes: incomes.length, members: people.length },
    groups: allowed.map((g) => ({ id: g._id, name: g.name, slug: g.slug })),
    scope: canReadTeam(req.user) ? (req.user.role === 'boss' ? 'group' : 'all') : 'self',
  });
});

export default router;
