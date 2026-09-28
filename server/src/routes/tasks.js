import { Router } from 'express';
import mongoose from 'mongoose';
import Task, { TASK_STATES } from '../models/Task.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { scopeFilter, canManageFor, canReadTeam, assignableFilter } from '../utils/visibility.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { checkDay, checkText } from '../utils/validate.js';
import { resolveRecordOwner, ownsRecords } from '../utils/recordOwner.js';
import { taskChanged } from '../socket/events.js';

const router = Router();
router.use(requireAuth);

const serialize = (t, user) => ({
  id: t._id,
  name: t.name,
  owner: t.owner?._id ? { id: t.owner._id, name: t.owner.name, role: t.owner.role } : null,
  group: t.group?._id ? { id: t.group._id, name: t.group.name, slug: t.group.slug } : null,
  startDate: t.startDate,
  endDate: t.endDate,
  salary: t.salary,
  status: t.status,
  note: t.note,
  createdAt: t.createdAt,
  canEdit: canManageFor(user, { _id: t.owner?._id ?? t.owner, group: t.group?._id ?? t.group }),
});

function checkDates(body, current = {}) {
  const start = body.startDate !== undefined ? checkDay(body.startDate, 'a start date') : current.startDate;
  const end = body.endDate !== undefined ? checkDay(body.endDate, 'an end date') : current.endDate;
  if (!start) throw badRequest('Choose a start date');
  if (!end) throw badRequest('Choose an end date');
  if (end < start) throw badRequest('The end date cannot be before the start date');
  return { startDate: start, endDate: end };
}

function checkFields(body) {
  const fields = {};
  if (body.name !== undefined) {
    fields.name = checkText(body.name, 'Task name', 120);
    if (!fields.name) throw badRequest('Give the task a name');
  }
  if (body.salary !== undefined) {
    const salary = body.salary === '' || body.salary === null ? 0 : Number(body.salary);
    if (!Number.isFinite(salary) || salary < 0) throw badRequest('Salary must be 0 or more');
    if (salary > 1e12) throw badRequest('Salary is too large');
    fields.salary = Math.round(salary * 100) / 100;
  }
  if (body.status !== undefined) {
    if (!TASK_STATES.includes(body.status)) throw badRequest('Unknown status');
    fields.status = body.status;
  }
  if (body.note !== undefined) {
    fields.note = checkText(body.note, 'Note', 2000);
  }
  return fields;
}

// Members can only sign tasks up for themselves. When a task is edited, a
// cleared owner is refused rather than read as "give it to me".
const resolveOwner = (req, { orSelf = false } = {}) => resolveRecordOwner(req, req.body.owner, {
  orSelf, denied: 'You cannot sign tasks up for that member',
});

// GET /api/tasks?status=&q=  — tasks this role may see.
router.get('/', async (req, res) => {
  const filter = scopeFilter(req.user, 'owner');
  if (req.query.status) {
    if (!TASK_STATES.includes(req.query.status)) throw badRequest('Unknown status');
    filter.status = req.query.status;
  }
  if (req.query.q?.trim()) {
    filter.name = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const tasks = await Task.find(filter).sort({ startDate: -1, createdAt: -1 })
    .populate('owner', 'name role').populate('group', 'name slug');
  const totals = tasks.reduce((acc, t) => ({
    salary: acc.salary + t.salary,
    done: acc.done + (t.status === 'done' ? 1 : 0),
  }), { salary: 0, done: 0 });

  res.json({
    tasks: tasks.map((t) => serialize(t, req.user)),
    totals: { ...totals, count: tasks.length },
    can: { assignOthers: canReadTeam(req.user), own: ownsRecords(req.user) },
    scope: canReadTeam(req.user) ? (req.user.role === 'boss' ? 'group' : 'all') : 'self',
  });
});

// Members this user can sign a task up for.
router.get('/assignees', async (req, res) => {
  const users = await User.find(assignableFilter(req.user), 'name role group')
    .populate('group', 'name').sort('name').lean();
  res.json({ members: users.map((u) => ({ id: u._id, name: u.name, role: u.role, group: u.group?.name ?? null })) });
});

router.post('/', async (req, res) => {
  const owner = await resolveOwner(req, { orSelf: true });
  const fields = checkFields(req.body);
  if (!fields.name) throw badRequest('Give the task a name');

  const task = await new Task({
    ...fields,
    ...checkDates(req.body),
    owner: owner._id,
    group: owner.group ?? null,
    createdBy: req.user._id,
  }).save();
  await task.populate('owner', 'name role');
  await task.populate('group', 'name slug');

  taskChanged(task);
  res.status(201).json({ task: serialize(task, req.user) });
});

async function findTask(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Task not found');
  const task = await Task.findById(req.params.id).populate('owner', 'name role').populate('group', 'name slug');
  if (!task) throw notFound('Task not found');
  // Out of scope tasks look like they do not exist.
  const scope = scopeFilter(req.user, 'owner');
  const visible = (!scope.group || String(scope.group) === String(task.group?._id ?? task.group))
    && (!scope.owner || String(scope.owner) === String(task.owner?._id ?? task.owner));
  if (!visible) throw notFound('Task not found');
  return task;
}

router.patch('/:id', async (req, res) => {
  const task = await findTask(req);
  if (!canManageFor(req.user, { _id: task.owner._id, group: task.group?._id ?? task.group })) {
    throw forbidden('You cannot change this task');
  }
  Object.assign(task, checkFields(req.body));
  if (req.body.startDate !== undefined || req.body.endDate !== undefined) {
    Object.assign(task, checkDates(req.body, task));
  }
  if (req.body.owner !== undefined) {
    const owner = await resolveOwner(req);
    task.owner = owner._id;
    task.group = owner.group ?? null;
  }
  await task.save();
  await task.populate('owner', 'name role');
  await task.populate('group', 'name slug');

  taskChanged(task);
  res.json({ task: serialize(task, req.user) });
});

router.delete('/:id', async (req, res) => {
  const task = await findTask(req);
  if (!canManageFor(req.user, { _id: task.owner._id, group: task.group?._id ?? task.group })) {
    throw forbidden('You cannot delete this task');
  }
  await task.deleteOne();
  taskChanged(task);
  res.json({ ok: true });
});

export default router;
