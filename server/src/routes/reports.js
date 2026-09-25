import { Router } from 'express';
import mongoose from 'mongoose';
import Report from '../models/Report.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import Group from '../models/Group.js';
import { requireAuth } from '../middleware/auth.js';
import { parsePeriod, periodKey, shiftPeriod } from '../utils/period.js';
import {
  canWritePersonal, canWriteGroup, readableAuthorFilter, canReadGroupReports, canReadTeam,
} from '../utils/reportPolicy.js';
import { visibleGroups } from '../utils/scope.js';
import { canSeeMember } from '../utils/visibility.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { reportChanged } from '../socket/events.js';

const router = Router();
router.use(requireAuth);

const HISTORY_LENGTH = 8;

function checkFields(body) {
  const num = (value, label) => {
    if (value === undefined || value === null || value === '') return 0;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw badRequest(`${label} must be 0 or more`);
    if (n > 1e12) throw badRequest(`${label} is too large`);
    return Math.round(n * 100) / 100;
  };
  const text = (value, label) => {
    const s = typeof value === 'string' ? value.trim() : '';
    if (s.length > 2000) throw badRequest(`${label} can be at most 2000 characters`);
    return s;
  };
  const day = (value, label) => {
    if (value === undefined || value === null || value === '') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw badRequest(`${label} must be a date (YYYY-MM-DD)`);
    const d = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) throw badRequest(`${label} is not a valid date`);
    return d;
  };
  return {
    jobBid: num(body.jobBid, 'Job bids'),
    aiBid: num(body.aiBid, 'AI training bids'),
    income: num(body.income, 'Income'),
    upcomingAmount: num(body.upcomingAmount, 'Upcoming amount'),
    upcomingNote: text(body.upcomingNote, 'Upcoming note'),
    upcomingDate: day(body.upcomingDate, 'Upcoming date'),
    note: text(body.note, 'Note'),
  };
}

// The task a personal report is about must belong to the author.
async function resolveTask(req, scope) {
  if (!req.body.task || scope !== 'personal') return null;
  if (!mongoose.isValidObjectId(req.body.task)) throw badRequest('Unknown task');
  const task = await Task.findById(req.body.task);
  if (!task || String(task.owner) !== String(req.user._id)) throw badRequest('That task belongs to someone else');
  return task._id;
}

const serialize = (r) => (r ? {
  id: r._id,
  author: r.author?._id ? { id: r.author._id, name: r.author.name, role: r.author.role } : null,
  group: r.group?._id ? { id: r.group._id, name: r.group.name, slug: r.group.slug } : null,
  scope: r.scope,
  type: r.type,
  period: r.period,
  // Older reports counted bids in one field; show them as job bids.
  jobBid: r.jobBid || r.bid || 0,
  aiBid: r.aiBid || 0,
  income: r.income,
  upcomingAmount: r.upcomingAmount,
  // Older reports kept a single free-text "upcoming" field.
  upcomingNote: r.upcomingNote || r.upcoming || '',
  upcomingDate: r.upcomingDate ?? null,
  task: r.task?._id ? { id: r.task._id, name: r.task.name, status: r.task.status } : null,
  note: r.note,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
} : null);

const sumOf = (rows) => rows.reduce((acc, r) => ({
  jobBid: acc.jobBid + (r.jobBid || r.bid || 0),
  aiBid: acc.aiBid + (r.aiBid || 0),
  income: acc.income + (r.income || 0),
  upcomingAmount: acc.upcomingAmount + (r.upcomingAmount || 0),
}), { jobBid: 0, aiBid: 0, income: 0, upcomingAmount: 0 });

// Reports are daily.
function checkType(type) {
  if (type && type !== 'daily') throw badRequest('Reports are daily');
  return 'daily';
}

// GET /api/reports?type=daily&period=2026-09-22&group=all|<slug>
// Returns the user's own report, the group report(s) they may see, and —
// for bosses, the leader and admins — every member in scope with their report.
router.get('/', async (req, res) => {
  const type = checkType(req.query.type);
  const period = parsePeriod(type, req.query.period || periodKey(type));
  const base = { type, period: period.key };

  const mine = await Report.findOne({ ...base, author: req.user._id, scope: 'personal' })
    .populate('author', 'name role').populate('group', 'name slug').populate('task', 'name status');
  const myGroupReport = canWriteGroup(req.user)
    ? await Report.findOne({ ...base, author: req.user._id, scope: 'group' })
      .populate('author', 'name role').populate('group', 'name slug')
    : null;

  // Group filter from the channel tree, limited to the groups this role may read.
  // Members read only their own reports, so no group can be picked at all.
  const groups = await Group.find({}, 'name slug').lean();
  const allowed = canReadTeam(req.user) ? visibleGroups(req.user, groups) : [];
  let groupFilter = null;
  if (req.query.group && req.query.group !== 'all') {
    const group = allowed.find((g) => g.slug === req.query.group);
    if (!group) throw notFound('Group not found');
    groupFilter = group._id;
  }

  // Only members and bosses write reports, so only they are listed (and counted
  // as missing). The leader and admins read.
  const authorFilter = {
    ...readableAuthorFilter(req.user),
    status: 'active',
    role: { $in: ['member', 'boss'] },
  };
  if (groupFilter) authorFilter.group = groupFilter;
  if (req.query.member) {
    const member = await User.findById(mongoose.isValidObjectId(req.query.member) ? req.query.member : null);
    if (!member || !canSeeMember(req.user, member)) throw notFound('Member not found');
    authorFilter._id = member._id;
  }

  const members = await User.find(authorFilter, 'name role group memberId')
    .populate('group', 'name slug').sort('name').lean();
  const memberIds = members.map((m) => m._id);

  const [personalReports, groupReports] = await Promise.all([
    Report.find({ ...base, scope: 'personal', author: { $in: memberIds } })
      .populate('author', 'name role').populate('group', 'name slug').populate('task', 'name status'),
    canReadGroupReports(req.user)
      ? Report.find({
        ...base,
        scope: 'group',
        ...(groupFilter ? { group: groupFilter } : { group: { $in: allowed.map((g) => g._id) } }),
      }).populate('author', 'name role').populate('group', 'name slug')
      : [],
  ]);

  const byAuthor = new Map(personalReports.map((r) => [String(r.author._id), r]));
  const rows = members.map((m) => ({
    member: {
      id: m._id, name: m.name, role: m.role, memberId: m.memberId,
      group: m.group ? { id: m.group._id, name: m.group.name, slug: m.group.slug } : null,
    },
    report: serialize(byAuthor.get(String(m._id))),
  }));

  const nextKey = shiftPeriod(type, period.key, 1);

  res.json({
    period: {
      ...period,
      type,
      prev: shiftPeriod(type, period.key, -1),
      next: nextKey,
      hasNext: parsePeriod(type, nextKey).start <= new Date(),
      isCurrent: period.key === periodKey(type),
    },
    can: { writePersonal: canWritePersonal(req.user), writeGroup: canWriteGroup(req.user) },
    mine: serialize(mine),
    myGroupReport: serialize(myGroupReport),
    // Members only fill in their own report; bosses see their group; the
    // leader and admins see everyone.
    rows: canReadGroupReports(req.user) ? rows : [],
    scope: req.user.role === 'boss' ? 'group' : (canReadGroupReports(req.user) ? 'all' : 'self'),
    groupReports: groupReports.map(serialize),
    totals: { ...sumOf(personalReports), submitted: personalReports.length, expected: members.length },
    groups: allowed.map((g) => ({ id: g._id, name: g.name, slug: g.slug })),
  });
});

// GET /api/reports/history?type=weekly — the user's own recent periods.
router.get('/history', async (req, res) => {
  const type = checkType(req.query.type);
  const keys = [];
  let key = periodKey(type);
  for (let i = 0; i < HISTORY_LENGTH; i += 1) {
    keys.push(key);
    key = shiftPeriod(type, key, -1);
  }
  const reports = await Report.find({ type, period: { $in: keys }, author: req.user._id, scope: 'personal' })
    .populate('task', 'name status');
  const byPeriod = new Map(reports.map((r) => [r.period, r]));
  res.json({
    history: keys.map((k) => ({
      period: k,
      label: parsePeriod(type, k).label,
      report: serialize(byPeriod.get(k)),
    })),
  });
});

// PUT /api/reports — create or update the caller's report for one period.
router.put('/', async (req, res) => {
  const type = checkType(req.body.type);
  const period = parsePeriod(type, req.body.period || periodKey(type));
  const scope = req.body.scope === 'group' ? 'group' : 'personal';

  if (scope === 'personal' && !canWritePersonal(req.user)) {
    throw forbidden('The team leader and admins read reports but do not write them');
  }
  if (scope === 'group' && !canWriteGroup(req.user)) {
    throw forbidden('Only a boss writes the group report, for their own group');
  }
  if (period.start > new Date()) throw badRequest('That period has not started yet');

  const report = await Report.findOneAndUpdate(
    { author: req.user._id, type, period: period.key, scope },
    {
      ...checkFields(req.body),
      task: await resolveTask(req, scope),
      group: scope === 'group' ? req.user.group : (req.user.group ?? null),
      periodStart: period.start,
      periodEnd: period.end,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  await report.populate('author', 'name role');
  await report.populate('group', 'name slug');
  await report.populate('task', 'name status');

  reportChanged(req.user, report);
  res.json({ report: serialize(report) });
});

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Report not found');
  const report = await Report.findById(req.params.id);
  if (!report) throw notFound('Report not found');
  if (String(report.author) !== String(req.user._id)) throw forbidden('You can only delete your own report');
  await report.deleteOne();
  reportChanged(req.user, report);
  res.json({ ok: true });
});

export default router;
