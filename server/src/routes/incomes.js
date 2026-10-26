import { Router } from 'express';
import mongoose from 'mongoose';
import Income from '../models/Income.js';
import Task from '../models/Task.js';
import Resident from '../models/Resident.js';
import Plan from '../models/Plan.js';
import Report from '../models/Report.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { scopeFilter, canReadTeam, assignableFilter } from '../utils/visibility.js';
import {
  financeScope, inPeriod, peopleInScope, perGroupSums, perMember, groupList, groupTiles, scopeName,
  person as personOf, ownerId, PERSON_FIELDS, LIST_LIMIT, DETAIL_LIMIT,
} from '../utils/finance.js';
import { badRequest, forbidden } from '../utils/httpError.js';
import { checkAmount, checkDay, checkText } from '../utils/validate.js';
import { resolveRecordOwner, ownsRecords } from '../utils/recordOwner.js';
import { imageUpload, describeUpload, checkImages, uploadLimiter } from '../utils/uploads.js';
import { imageUrl } from '../utils/fileRefs.js';
import { currentMethods, methodOf, checkPayment, computeSplit } from '../utils/payments.js';
import { incomeChanged } from '../socket/events.js';

const router = Router();
router.use(requireAuth);

const serialize = (i) => ({
  id: i._id,
  member: personOf(i.member),
  group: i.group?._id ? { id: i.group._id, name: i.group.name, slug: i.group.slug } : null,
  date: i.date,
  amount: i.amount,
  from: i.from,
  note: i.note,
  task: i.task?._id ? { id: i.task._id, name: i.task.name } : null,
  images: (i.images ?? []).map(imageUrl),
  method: i.method ?? 'other',
  methodLabel: methodOf(i.method)?.label ?? 'Other',
  feePercent: i.feePercent ?? 0,
  feeFixed: i.feeFixed ?? 0,
  feeAmount: i.feeAmount ?? 0,
  resident: i.resident?._id ? { id: i.resident._id, name: i.resident.name } : null,
  residentPercent: i.residentPercent ?? 0,
  residentAmount: i.residentAmount ?? 0,
  // Older records (before fees) are all net.
  net: i.net ?? (i.feeAmount === undefined ? i.amount : 0),
  createdAt: i.createdAt,
});

function checkFields(body, partial = false) {
  const fields = {};
  if (!partial || body.date !== undefined) fields.date = checkDay(body.date, 'a date');
  if (!partial || body.amount !== undefined) fields.amount = checkAmount(body.amount);
  if (body.note !== undefined) fields.note = checkText(body.note, 'Note', 2000);
  return fields;
}

const resolveMember = (req) => resolveRecordOwner(req, req.body.member, {
  orSelf: true, denied: 'You cannot record income for that member',
});

// The resident the income relates to must belong to the member it is for.
async function resolveResident(req, member) {
  if (!req.body.resident) return null;
  if (!mongoose.isValidObjectId(req.body.resident)) throw badRequest('Unknown resident');
  const resident = await Resident.findOne({ _id: req.body.resident, owner: member._id });
  if (!resident) throw badRequest('That resident belongs to someone else');
  return resident;
}

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
//   upcoming : what the member's reports say is due inside this period (by the
//              upcoming date), whenever the report was written
// Members with nothing recorded still get a row, so the chart shows who is behind.
async function incomeChart(user, period, { groupId, memberId }, byMember, incomes) {
  const planFilter = { ...scopeFilter(user, 'owner'), scope: 'personal', periodStart: inPeriod(period) };
  const reportFilter = { ...scopeFilter(user, 'author'), scope: 'personal', upcomingAmount: { $gt: 0 }, upcomingDate: inPeriod(period) };
  if (groupId) { planFilter.group = groupId; reportFilter.group = groupId; }
  if (memberId) { planFilter.owner = memberId; reportFilter.author = memberId; }
  if (period.type === 'weekly') planFilter.type = 'weekly';

  const [people, plans, reports] = await Promise.all([
    peopleInScope(user, { groupId, memberId }, incomes.map((i) => ownerId(i, 'member'))),
    Plan.find(planFilter, 'owner type income').lean(),
    Report.find(reportFilter, 'author upcomingAmount upcomingDate upcomingNote task periodStart')
      .populate('task', 'name').sort({ upcomingDate: 1, periodStart: -1 }).lean(),
  ]);

  return people.map((person) => {
    const id = String(person._id);
    const ownPlans = plans.filter((p) => String(p.owner) === id);
    const monthly = ownPlans.filter((p) => p.type === 'monthly');
    const planned = (monthly.length ? monthly : ownPlans).reduce((sum, p) => sum + (p.income || 0), 0);
    const ownReports = reports.filter((r) => String(r.author) === id);
    const upcoming = ownReports.reduce((sum, r) => sum + (r.upcomingAmount || 0), 0);

    // Each income record: when it came in, from which task (or client) and how much.
    const own = incomes.filter((i) => String(i.member?._id ?? i.member) === id);
    const incomeItems = own
      .slice(0, DETAIL_LIMIT)
      .map((i) => ({
        id: i._id,
        date: i.date,
        amount: i.amount,
        task: i.task?._id ? { id: i.task._id, name: i.task.name } : null,
        from: i.from,
        note: i.note || '',
      }));

    return {
      member: personOf(person),
      incomeCount: own.length,
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
    .populate('member', PERSON_FIELDS).populate('group', 'name slug').populate('task', 'name').populate('resident', 'name').lean();

  // Totals overall and per member, for the summary.
  const byMember = perMember(incomes);
  const total = incomes.reduce((sum, i) => sum + i.amount, 0);
  const sums = incomes.reduce((acc, i) => ({
    fees: acc.fees + (i.feeAmount || 0),
    residents: acc.residents + (i.residentAmount || 0),
    net: acc.net + (i.net ?? (i.feeAmount === undefined ? i.amount : 0)),
  }), { fees: 0, residents: 0, net: 0 });

  const chart = await incomeChart(req.user, period, { groupId, memberId }, byMember, incomes);

  const sumFor = await perGroupSums(Income, req.user, allowed, period);
  const perGroup = groupTiles(allowed, (k) => sumFor.has(k), (k) => ({
    amount: sumFor.get(k)?.amount ?? 0,
    count: sumFor.get(k)?.count ?? 0,
  }));

  res.json({
    period,
    // The newest records; `count` is how many there are in all.
    incomes: incomes.slice(0, LIST_LIMIT).map((i) => serialize(i)),
    count: incomes.length,
    total,
    fees: sums.fees,
    residents: sums.residents,
    net: sums.net,
    methods: currentMethods(),
    perMember: [...byMember.values()].sort((a, b) => b.amount - a.amount),
    perGroup,
    chart,
    groups: groupList(allowed),
    can: { record: ownsRecords(req.user) || canReadTeam(req.user), recordForSelf: ownsRecords(req.user), recordForOthers: canReadTeam(req.user) },
    scope: scopeName(req.user),
  });
});

// Payment methods and their usual fees, for the form.
router.get('/methods', (req, res) => res.json({ methods: currentMethods() }));

// Members this user can record income for.
router.get('/members', async (req, res) => {
  const users = await User.find(assignableFilter(req.user), 'name role group')
    .populate('group', 'name').sort('name').lean();
  res.json({ members: users.map((u) => ({ id: u._id, name: u.name, role: u.role, group: u.group?.name ?? null })) });
});

// POST /api/incomes/upload — multipart `images` files; returns the
// references to send back in the record's `images`.
router.post('/upload', uploadLimiter(), (req, res, next) => {
  if (!ownsRecords(req.user) && !canReadTeam(req.user)) return next(forbidden('You cannot record income'));
  next();
}, imageUpload, (req, res) => {
  res.status(201).json({ images: (req.files ?? []).map(describeUpload) });
});

router.post('/', async (req, res) => {
  const member = await resolveMember(req);
  const fields = checkFields(req.body);
  const resident = await resolveResident(req, member);
  // The resident's share defaults to the divide % on their record.
  const payment = checkPayment({ ...req.body, residentPercent: req.body.residentPercent ?? resident?.sharePercent ?? 0 });
  const taskId = await resolveTask(req, member);
  const task = taskId ? await Task.findById(taskId, 'name').lean() : null;
  const income = await new Income({
    ...fields,
    ...payment,
    ...computeSplit({ amount: fields.amount, ...payment }),
    from: task?.name ?? resident?.name ?? methodOf(payment.method)?.label ?? '',
    images: (await checkImages(req.body.images)) ?? [],
    member: member._id,
    group: member.group ?? null,
    task: taskId,
    resident: resident?._id ?? null,
    createdBy: req.user._id,
  }).save();
  await income.populate([{ path: 'member', select: 'name role' }, { path: 'group', select: 'name slug' }, { path: 'task', select: 'name' }, { path: 'resident', select: 'name' }]);

  incomeChanged(income);
  res.status(201).json({ income: serialize(income) });
});

// Income records are history: once recorded they cannot be changed or
// removed through the API.
router.patch('/:id', () => { throw forbidden('Income records cannot be edited'); });
router.delete('/:id', () => { throw forbidden('Income records cannot be deleted'); });

export default router;
