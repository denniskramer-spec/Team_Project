import { Router } from 'express';
import Plan, { PLAN_STATES } from '../models/Plan.js';
import Report from '../models/Report.js';
import Task from '../models/Task.js';
import Income from '../models/Income.js';
import User from '../models/User.js';
import Group from '../models/Group.js';
import { requireAuth } from '../middleware/auth.js';
import { parsePeriod, periodKey, shiftPeriod } from '../utils/period.js';
import mongoose from 'mongoose';
import { scopeFilter, canReadTeam, canSeeMember } from '../utils/visibility.js';
import { visibleGroups } from '../utils/scope.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { person as personOf } from '../utils/finance.js';

const router = Router();
router.use(requireAuth);

// Checkout periods are weekly, monthly and yearly ("annual" internally).
const TYPES = { weekly: 'weekly', monthly: 'monthly', yearly: 'annual' };

const sum = (rows, field) => rows.reduce((total, row) => total + (row[field] || 0), 0);
// Records written before bids were split counted them all as job bids.
const sumJobBids = (rows) => rows.reduce((total, row) => total + (row.jobBid || row.bid || 0), 0);

// GET /api/checkout?type=weekly|monthly|yearly&period=&group=all|<slug>
// Pulls together the Plan, Report, Task and Finance channels for one period.
router.get('/', async (req, res) => {
  const titleType = req.query.type || 'weekly';
  const type = TYPES[titleType];
  if (!type) throw badRequest('Checkout periods are weekly, monthly or yearly');
  const period = parsePeriod(type, req.query.period || periodKey(type));

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

  const [allPlans, reports, tasks, incomes, current] = await Promise.all([
    // Personal plans only: a boss's group plan repeats their members' targets.
    Plan.find(withGroup({ ...owners, ...planned, scope: 'personal' }, 'owner')).lean(),
    Report.find(withGroup({ ...authors, ...inside, scope: 'personal' }, 'author')).lean(),
    // Tasks that overlap the period at all.
    Task.find(withGroup({ ...owners, startDate: { $lt: period.end }, endDate: { $gte: period.start } }, 'owner')).lean(),
    Income.find(withGroup({ ...members, date: { $gte: period.start, $lt: period.end } }, 'member')).lean(),
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
    reported: sum(reports, 'income'),
    actual: sum(incomes, 'amount'),
  };
  const jobBid = { planned: sumJobBids(plans), reported: sumJobBids(reports) };
  const aiBid = { planned: sum(plans, 'aiBid'), reported: sum(reports, 'aiBid') };
  const task = {
    done: tasks.filter((t) => t.status === 'done').length,
    total: tasks.length,
    salary: sum(tasks, 'salary'),
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
      reported: { jobBid: sumJobBids(mine.reports), aiBid: sum(mine.reports, 'aiBid'), income: sum(mine.reports, 'income') },
      upcoming: sum(mine.reports, 'upcomingAmount'),
      actualIncome: sum(mine.incomes, 'amount'),
      tasks: { total: mine.tasks.length, done: mine.tasks.filter((t) => t.status === 'done').length, salary: sum(mine.tasks, 'salary') },
      planStates: PLAN_STATES.reduce((acc, s) => ({ ...acc, [s]: mine.allPlans.filter((p) => p.status === s).length }), {}),
    };
  });

  const nextKey = shiftPeriod(type, period.key, 1);
  res.json({
    period: {
      ...period,
      type: titleType,
      prev: shiftPeriod(type, period.key, -1),
      next: nextKey,
      hasNext: parsePeriod(type, nextKey).start <= new Date(),
      isCurrent: period.key === periodKey(type),
    },
    income,
    jobBid,
    aiBid,
    task,
    planStates,
    rows,
    taskSalary: sum(tasks, 'salary'),
    counts: { plans: allPlans.length, reports: reports.length, tasks: tasks.length, incomes: incomes.length, members: people.length },
    groups: allowed.map((g) => ({ id: g._id, name: g.name, slug: g.slug })),
    scope: canReadTeam(req.user) ? (req.user.role === 'boss' ? 'group' : 'all') : 'self',
  });
});

export default router;
