import { Router } from 'express';
import { archiveDeleted } from '../utils/audit.js';
import mongoose from 'mongoose';
import Task, { TASK_STATES, PRICE_UNITS, CURRENCIES } from '../models/Task.js';
import Report from '../models/Report.js';
import Resident from '../models/Resident.js';
import { requireAuth } from '../middleware/auth.js';
import {
  scopeFilter, canManageFor, canReadTeam, visibleRecord, assignableMembers, scopeName,
} from '../utils/visibility.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { checkDay, checkText, searchRegex } from '../utils/validate.js';
import { resolveRecordOwner, ownsRecords } from '../utils/recordOwner.js';
import { parsePeriod } from '../utils/period.js';
import { checkPrice, formatPrice, workLines } from '../utils/project.js';
import { imageUrl } from '../utils/fileRefs.js';
import { currentMethods, methodOf } from '../utils/payments.js';
import { taskChanged } from '../socket/events.js';
import { repriceTask, dropTaskWork } from '../utils/reportWork.js';
import { workSummary } from '../utils/projectWork.js';

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
const resolveOwner = (req, { orSelf = false } = {}) => resolveRecordOwner(req, req.body.owner, { orSelf });

// How many projects one page lists; the totals always count every project.
const LIST_LIMIT = 500;

// GET /api/tasks?status=&q=  — projects this role may see.
router.get('/', async (req, res) => {
  const filter = scopeFilter(req.user, 'owner');
  if (req.query.status) {
    if (!TASK_STATES.includes(req.query.status)) throw badRequest('Unknown status');
    filter.status = req.query.status;
  }
  const q = searchRegex(req.query.q);
  if (q) filter.name = q;

  // Active projects first, newest first; the counts per status cover them all.
  const [tasks, byStatus] = await Promise.all([
    populate(Task.find(filter).sort({ status: 1, startDate: -1, createdAt: -1 }).limit(LIST_LIMIT)),
    Task.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
  const total = Object.values(counts).reduce((n, c) => n + c, 0);
  const work = await workSummary(tasks);
  const projects = tasks.map((t) => serialize(t, req.user, work[String(t._id)]));
  const active = projects.filter((p) => p.status === 'active');

  res.json({
    tasks: projects,
    hasMore: total > projects.length,
    totals: {
      count: total,
      active: counts.active ?? 0,
      // Active projects are listed first, so this is exact unless more than
      // LIST_LIMIT of them are active.
      withoutToday: active.filter((p) => !p.writtenToday).length,
      done: counts.done ?? 0,
    },
    options: { statuses: TASK_STATES, units: PRICE_UNITS, currencies: CURRENCIES, methods: currentMethods() },
    can: { assignOthers: canReadTeam(req.user), own: ownsRecords(req.user) },
    scope: scopeName(req.user),
  });
});

// Members this user can register a project for.
router.get('/assignees', async (req, res) => {
  res.json({ members: await assignableMembers(req.user) });
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
  if (!visibleRecord(req.user, task, 'owner')) throw notFound('Project not found');
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
  const priceBefore = `${task.price}|${task.priceUnit}|${task.resident?._id ?? ''}`;
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

  // A new price (or resident share) changes what the unpaid days are worth.
  if (`${task.price}|${task.priceUnit}|${task.resident?._id ?? ''}` !== priceBefore) await repriceTask(task._id);

  taskChanged(task);
  const work = await workSummary([task]);
  res.json({ task: serialize(task, req.user, work[String(task._id)]) });
});

router.delete('/:id', async (req, res) => {
  const task = await findTask(req);
  if (!mayManage(req.user, task)) throw forbidden('You cannot delete this project');
  await archiveDeleted(task, req, { model: 'Task', label: task.name });
  await task.deleteOne();
  // The day's work written on it leaves the reports, and their upcoming
  // amounts follow.
  await dropTaskWork(task._id);
  taskChanged(task);
  res.json({ ok: true });
});

export default router;
