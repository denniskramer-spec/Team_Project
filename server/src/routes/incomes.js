import { Router } from 'express';
import mongoose from 'mongoose';
import Income from '../models/Income.js';
import Task from '../models/Task.js';
import Plan from '../models/Plan.js';
import Report from '../models/Report.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { scopeFilter, canReadTeam, assignableFilter } from '../utils/visibility.js';
import { financeScope, inPeriod, peopleInScope, perGroupSums, perMember, groupList, scopeName } from '../utils/finance.js';
import { badRequest, forbidden } from '../utils/httpError.js';
import { checkAmount, checkDay, checkText } from '../utils/validate.js';
import { resolveRecordOwner, ownsRecords } from '../utils/recordOwner.js';
import { incomeChanged } from '../socket/events.js';

const router = Router();
router.use(requireAuth);

const serialize = (i) => ({
  id: i._id,
  member: i.member?._id ? { id: i.member._id, name: i.member.name, role: i.member.role } : null,
  group: i.group?._id ? { id: i.group._id, name: i.group.name, slug: i.group.slug } : null,
  date: i.date,
  amount: i.amount,
  from: i.from,
  note: i.note,
  task: i.task?._id ? { id: i.task._id, name: i.task.name } : null,
  createdAt: i.createdAt,
});

function checkFields(body, partial = false) {
  const fields = {};
  if (!partial || body.date !== undefined) fields.date = checkDay(body.date, 'a date');
  if (!partial || body.amount !== undefined) fields.amount = checkAmount(body.amount);
  if (!partial || body.from !== undefined) {
    fields.from = checkText(body.from, '"From"', 120);
    if (!fields.from) throw badRequest('Say where the income came from');
  }
  if (body.note !== undefined) fields.note = checkText(body.note, 'Note', 2000);
  return fields;
}

const resolveMember = (req) => resolveRecordOwner(req, req.body.member, {
  orSelf: true, denied: 'You cannot record income for that member',
});

async function resolveTask(req, member) {
  if (!req.body.task) return null;
  if (!mongoose.isValidObjectId(req.body.task)) throw badRequest('Unknown task');
  const task = await Task.findById(req.body.task);
  if (!task || String(task.owner) !== String(member._id)) throw badRequest('That task belongs to someone else');
  return task._id;
}

// Planned vs real income per member, for the Finance chart.
//   planned  : for a week, the member's weekly plan; for longer periods their
//              monthly plans, or their weekly plans when they have no monthly ones
//   actual   : income records in the period (same numbers as the table)
//   upcoming : what the member's reports in the period say is still to come
// Members with nothing recorded still get a row, so the chart shows who is behind.
async function incomeChart(user, period, { groupId, memberId }, byMember, incomes) {
  const planFilter = { ...scopeFilter(user, 'owner'), scope: 'personal', periodStart: inPeriod(period) };
  const reportFilter = { ...scopeFilter(user, 'author'), scope: 'personal', periodStart: inPeriod(period) };
  if (groupId) { planFilter.group = groupId; reportFilter.group = groupId; }
  if (memberId) { planFilter.owner = memberId; reportFilter.author = memberId; }
  if (period.type === 'weekly') planFilter.type = 'weekly';

  const [people, plans, reports] = await Promise.all([
    peopleInScope(user, { groupId, memberId }),
    Plan.find(planFilter, 'owner type income').lean(),
    Report.find(reportFilter, 'author upcomingAmount upcomingDate upcomingNote task periodStart')
      .populate('task', 'name').sort({ periodStart: -1 }).lean(),
  ]);

  return people.map((person) => {
    const id = String(person._id);
    const own = plans.filter((p) => String(p.owner) === id);
    const monthly = own.filter((p) => p.type === 'monthly');
    const planned = (monthly.length ? monthly : own).reduce((sum, p) => sum + (p.income || 0), 0);
    const ownReports = reports.filter((r) => String(r.author) === id);
    const upcoming = ownReports.reduce((sum, r) => sum + (r.upcomingAmount || 0), 0);

    // Each income record: when it came in, from which task (or client) and how much.
    const incomeItems = incomes
      .filter((i) => String(i.member?._id ?? i.member) === id)
      .map((i) => ({
        id: i._id,
        date: i.date,
        amount: i.amount,
        task: i.task?._id ? { id: i.task._id, name: i.task.name } : null,
        from: i.from,
        note: i.note || '',
      }));

    return {
      member: { id: person._id, name: person.name, role: person.role },
      planned,
      actual: byMember.get(id)?.amount ?? 0,
      upcoming,
      incomeItems,
      // What is still expected, with the day it is due and the task it belongs to.
      upcomingItems: ownReports.filter((r) => r.upcomingAmount > 0).map((r) => ({
        amount: r.upcomingAmount,
        date: r.upcomingDate ?? null,
        reportDay: r.periodStart,
        task: r.task?._id ? { id: r.task._id, name: r.task.name } : null,
        note: r.upcomingNote || '',
      })),
    };
  });
}

// GET /api/incomes?type=week|month|year&group=all|<slug>&member=<id>
// A period key (?period=2026-09) or a day inside it (?date=YYYY-MM-DD) picks
// another period; ?type=range&from=&to= picks any duration (see utils/finance.js).
router.get('/', async (req, res) => {
  const { period, filter, allowed, groupId, memberId } = await financeScope(req, 'member');

  const incomes = await Income.find(filter).sort({ date: -1, createdAt: -1 })
    .populate('member', 'name role').populate('group', 'name slug').populate('task', 'name');

  // Totals overall and per member, for the summary.
  const byMember = perMember(incomes);
  const total = incomes.reduce((sum, i) => sum + i.amount, 0);

  const chart = await incomeChart(req.user, period, { groupId, memberId }, byMember, incomes);

  const sumFor = await perGroupSums(Income, req.user, allowed, period);
  const perGroup = allowed.map((g) => ({
    id: g._id,
    name: g.name,
    slug: g.slug,
    amount: sumFor.get(String(g._id))?.amount ?? 0,
    count: sumFor.get(String(g._id))?.count ?? 0,
  }));

  res.json({
    period,
    incomes: incomes.map((i) => serialize(i)),
    total,
    perMember: [...byMember.values()].sort((a, b) => b.amount - a.amount),
    perGroup,
    chart,
    groups: groupList(allowed),
    can: { record: ownsRecords(req.user) || canReadTeam(req.user), recordForSelf: ownsRecords(req.user), recordForOthers: canReadTeam(req.user) },
    scope: scopeName(req.user),
  });
});

// Members this user can record income for.
router.get('/members', async (req, res) => {
  const users = await User.find(assignableFilter(req.user), 'name role group')
    .populate('group', 'name').sort('name').lean();
  res.json({ members: users.map((u) => ({ id: u._id, name: u.name, role: u.role, group: u.group?.name ?? null })) });
});

router.post('/', async (req, res) => {
  const member = await resolveMember(req);
  const income = await new Income({
    ...checkFields(req.body),
    member: member._id,
    group: member.group ?? null,
    task: await resolveTask(req, member),
    createdBy: req.user._id,
  }).save();
  await income.populate('member', 'name role');
  await income.populate('group', 'name slug');
  await income.populate('task', 'name');

  incomeChanged(income);
  res.status(201).json({ income: serialize(income) });
});

// Income records are history: once recorded they cannot be changed or
// removed through the API.
router.patch('/:id', () => { throw forbidden('Income records cannot be edited'); });
router.delete('/:id', () => { throw forbidden('Income records cannot be deleted'); });

export default router;
