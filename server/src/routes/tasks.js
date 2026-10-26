import { Router } from 'express';
import mongoose from 'mongoose';
import Task, { TASK_STATES, PRICE_UNITS, CURRENCIES } from '../models/Task.js';
import Report from '../models/Report.js';
import Income from '../models/Income.js';
import Resident from '../models/Resident.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { scopeFilter, canManageFor, canReadTeam, assignableFilter } from '../utils/visibility.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { checkDay, checkText } from '../utils/validate.js';
import { resolveRecordOwner, ownsRecords } from '../utils/recordOwner.js';
import { periodKey, parsePeriod } from '../utils/period.js';
import { checkPrice, formatPrice, workLines } from '../utils/project.js';
import { imageUrl } from '../utils/fileRefs.js';
import { currentMethods, methodOf } from '../utils/payments.js';
import { taskChanged } from '../socket/events.js';

// Projects (the model keeps its old name, Task): what a member works on,
// with the day-by-day work log taken from their daily reports.
const router = Router();
router.use(requireAuth);

const POPULATE = [
  { path: 'owner', select: 'name role' }, { path: 'group', select: 'name slug' }, { path: 'resident', select: 'name photo' },
];
const populate = (q) => q.populate(POPULATE);

const serialize = (t, user, work = {}) => ({
  id: t._id,
  name: t.name,
  owner: t.owner?._id ? { id: t.owner._id, name: t.owner.name, role: t.owner.role } : null,
  group: t.group?._id ? { id: t.group._id, name: t.group.name, slug: t.group.slug } : null,
  source: t.source,
  resident: t.resident?._id ? { id: t.resident._id, name: t.resident.name, photo: imageUrl(t.resident.photo) } : null,
  price: t.price,
  currency: t.currency,
  priceUnit: t.priceUnit,
  priceLabel: formatPrice(t),
  method: t.method ?? '',
  methodLabel: t.method ? (methodOf(t.method)?.label ?? t.method) : '',
  startDate: t.startDate,
  endDate: t.endDate ?? null,
  status: t.status,
  note: t.note,
  // From the owner's daily reports: how many days carry work on this
  // project, and whether today's report does.
  daysWorked: work.days ?? 0,
  writtenToday: work.today ?? false,
  // What the reported hours and tasks still expect to be paid, and what
  // income records on the project have paid so far.
  upcoming: work.upcoming ?? 0,
  paid: work.paid ?? 0,
  hours: work.hours ?? 0,
  createdAt: t.createdAt,
  canEdit: canManageFor(user, { _id: t.owner?._id ?? t.owner, group: t.group?._id ?? t.group }),
});

// Work on these projects, counted from the daily reports, plus what income
// records have paid: { [taskId]: { days, today, upcoming, paid, hours } }.
async function workSummary(tasks) {
  if (!tasks.length) return {};
  const ids = tasks.map((t) => t._id);
  const reports = await Report.find({ scope: 'personal', type: 'daily', 'work.task': { $in: ids } }, 'author period work').lean();
  const today = periodKey('daily');
  const owners = new Map(tasks.map((t) => [String(t._id), String(t.owner?._id ?? t.owner)]));
  const out = {};
  for (const r of reports) {
    for (const w of r.work ?? []) {
      const id = String(w.task);
      // Only the owner's own reports count (a project moved between people
      // keeps its log from the current owner).
      if (!owners.has(id) || owners.get(id) !== String(r.author) || !(w.text?.trim() || w.hours || w.count)) continue;
      out[id] ??= { days: 0, today: false, upcoming: 0, paid: 0, hours: 0 };
      out[id].days += 1;
      if (!w.paidBy) out[id].upcoming = Math.round((out[id].upcoming + (w.amount || 0)) * 100) / 100;
      out[id].hours += w.hours || 0;
      if (r.period === today) out[id].today = true;
    }
  }
  const paid = await Income.aggregate([{ $match: { task: { $in: ids } } }, { $group: { _id: '$task', amount: { $sum: '$amount' } } }]);
  for (const p of paid) {
    const id = String(p._id);
    out[id] ??= { days: 0, today: false, upcoming: 0, paid: 0, hours: 0 };
    out[id].paid = Math.round(p.amount * 100) / 100;
  }
  return out;
}

function checkDates(body, current = {}) {
  const start = body.startDate !== undefined ? checkDay(body.startDate, 'a start date') : current.startDate;
  let end = current.endDate ?? null;
  if (body.endDate !== undefined) end = body.endDate === null || body.endDate === '' ? null : checkDay(body.endDate, 'an expiry date');
  if (!start) throw badRequest('Choose the day work on it began');
  if (end && end < start) throw badRequest('The expiry date cannot be before the start date');
  return { startDate: start, endDate: end };
}

// The resident a project is for: one the caller may see, or none.
async function resolveResident(req) {
  const value = req.body.resident;
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) throw badRequest('Unknown resident');
  const resident = await Resident.findOne({ ...scopeFilter(req.user, 'owner'), _id: value }, '_id').lean();
  if (!resident) throw badRequest('Unknown resident');
  return resident._id;
}

async function checkFields(req) {
  const { body } = req;
  const fields = { ...checkPrice(body) };
  if (body.name !== undefined) {
    fields.name = checkText(body.name, 'Project title', 120);
    if (!fields.name) throw badRequest('Give the project a title');
  }
  if (body.source !== undefined) fields.source = checkText(body.source, 'Source', 120);
  if (body.method !== undefined) {
    if (body.method !== '' && body.method !== null && !methodOf(body.method)) throw badRequest('Unknown payment method');
    fields.method = body.method || '';
  }
  const resident = await resolveResident(req);
  if (resident !== undefined) fields.resident = resident;
  if (body.status !== undefined) {
    if (!TASK_STATES.includes(body.status)) throw badRequest('Status is active, paused or done');
    fields.status = body.status;
  }
  if (body.note !== undefined) fields.note = checkText(body.note, 'Notes', 2000);
  return fields;
}

// Members can only register projects for themselves. When a project is
// edited, a cleared owner is refused rather than read as "give it to me".
const resolveOwner = (req, { orSelf = false } = {}) => resolveRecordOwner(req, req.body.owner, {
  orSelf, denied: 'You cannot register projects for that member',
});

// GET /api/tasks?status=&q=  — projects this role may see.
router.get('/', async (req, res) => {
  const filter = scopeFilter(req.user, 'owner');
  if (req.query.status) {
    if (!TASK_STATES.includes(req.query.status)) throw badRequest('Unknown status');
    filter.status = req.query.status;
  }
  if (req.query.q?.trim()) {
    filter.name = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const tasks = await populate(Task.find(filter).sort({ status: 1, startDate: -1, createdAt: -1 }));
  const work = await workSummary(tasks);
  const projects = tasks.map((t) => serialize(t, req.user, work[String(t._id)]));
  const active = projects.filter((p) => p.status === 'active');

  res.json({
    tasks: projects,
    totals: {
      count: projects.length,
      active: active.length,
      withoutToday: active.filter((p) => !p.writtenToday).length,
      done: projects.filter((p) => p.status === 'done').length,
    },
    options: { statuses: TASK_STATES, units: PRICE_UNITS, currencies: CURRENCIES, methods: currentMethods() },
    can: { assignOthers: canReadTeam(req.user), own: ownsRecords(req.user) },
    scope: canReadTeam(req.user) ? (req.user.role === 'boss' ? 'group' : 'all') : 'self',
  });
});

// Members this user can register a project for.
router.get('/assignees', async (req, res) => {
  const users = await User.find(assignableFilter(req.user), 'name role group')
    .populate('group', 'name').sort('name').lean();
  res.json({ members: users.map((u) => ({ id: u._id, name: u.name, role: u.role, group: u.group?.name ?? null })) });
});

// Residents a project can be for: the ones this user may see.
router.get('/residents', async (req, res) => {
  const residents = await Resident.find(scopeFilter(req.user, 'owner'), 'name owner').populate('owner', 'name').sort('name').lean();
  res.json({ residents: residents.map((r) => ({ id: r._id, name: r.name, owner: r.owner?.name ?? null })) });
});

router.post('/', async (req, res) => {
  const owner = await resolveOwner(req, { orSelf: true });
  const fields = await checkFields(req);
  if (!fields.name) throw badRequest('Give the project a title');

  const task = await new Task({
    ...fields,
    ...checkDates(req.body),
    owner: owner._id,
    group: owner.group ?? null,
    createdBy: req.user._id,
  }).save();
  await populate(task);

  taskChanged(task);
  res.status(201).json({ task: serialize(task, req.user) });
});

async function findTask(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Project not found');
  const task = await populate(Task.findById(req.params.id));
  if (!task) throw notFound('Project not found');
  // Out of scope projects look like they do not exist.
  const scope = scopeFilter(req.user, 'owner');
  const visible = (!scope.group || String(scope.group) === String(task.group?._id ?? task.group))
    && (!scope.owner || String(scope.owner) === String(task.owner?._id ?? task.owner));
  if (!visible) throw notFound('Project not found');
  return task;
}

// GET /api/tasks/:id/log — the day-by-day work on one project, newest first,
// from the owner's daily reports.
router.get('/:id/log', async (req, res) => {
  const task = await findTask(req);
  const reports = await Report.find({ scope: 'personal', type: 'daily', author: task.owner._id, 'work.task': task._id }, 'period work updatedAt')
    .sort({ periodStart: -1 }).lean();
  const log = reports.flatMap((r) => {
    const entry = (r.work ?? []).find((w) => String(w.task) === String(task._id));
    const lines = workLines(entry?.text);
    return lines.length ? [{ period: r.period, label: parsePeriod('daily', r.period).label, lines, hours: entry?.hours ?? 0, count: entry?.count ?? 0, amount: entry?.amount ?? 0, paid: Boolean(entry?.paidBy), updatedAt: r.updatedAt }] : [];
  });
  res.json({ log, days: log.length, upcoming: Math.round(log.filter((e) => !e.paid).reduce((n, e) => n + (e.amount || 0), 0) * 100) / 100 });
});

const mayManage = (user, t) => canManageFor(user, { _id: t.owner._id, group: t.group?._id ?? t.group });

router.patch('/:id', async (req, res) => {
  const task = await findTask(req);
  if (!mayManage(req.user, task)) throw forbidden('You cannot change this project');
  Object.assign(task, await checkFields(req));
  if (req.body.startDate !== undefined || req.body.endDate !== undefined) {
    Object.assign(task, checkDates(req.body, task));
  }
  if (req.body.owner !== undefined) {
    const owner = await resolveOwner(req);
    task.owner = owner._id;
    task.group = owner.group ?? null;
  }
  await task.save();
  await populate(task);

  taskChanged(task);
  const work = await workSummary([task]);
  res.json({ task: serialize(task, req.user, work[String(task._id)]) });
});

router.delete('/:id', async (req, res) => {
  const task = await findTask(req);
  if (!mayManage(req.user, task)) throw forbidden('You cannot delete this project');
  await task.deleteOne();
  // The day's work written on it stays in the reports but no longer points anywhere.
  await Report.updateMany({ 'work.task': task._id }, { $pull: { work: { task: task._id } } });
  taskChanged(task);
  res.json({ ok: true });
});

export default router;
