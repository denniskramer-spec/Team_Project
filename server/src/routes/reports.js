import { Router } from 'express';
import { archiveDeleted } from '../utils/audit.js';
import mongoose from 'mongoose';
import Report, { CALL_RESULTS } from '../models/Report.js';
import Task from '../models/Task.js';
import { workEarnings } from '../utils/payments.js';
import User from '../models/User.js';
import Group from '../models/Group.js';
import { requireAuth } from '../middleware/auth.js';
import { parsePeriod, periodKey, shiftPeriod } from '../utils/period.js';
import { teamDayEnd, teamNow } from '../utils/teamTime.js';
import {
  canWritePersonal, readableAuthorFilter, readableReportFilter, canReadGroupReports, canReadTeam,
} from '../utils/reportPolicy.js';
import { visibleGroups } from '../utils/scope.js';
import { canSeeMember } from '../utils/visibility.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { checkOptionalAmount, checkCount, checkDay, checkList, checkText } from '../utils/validate.js';
import { canChangeGroupRecord } from '../utils/groupRecords.js';
import { person as personOf } from '../utils/finance.js';
import { reportChanged, taskWorkChanged } from '../socket/events.js';
import { earnedOf } from '../utils/reportWork.js';
import { saveReport } from '../utils/reportDraft.js';
import { groupSummary, planLines, sumOf, writerContext } from '../utils/reportSummary.js';

const router = Router();
router.use(requireAuth);

const HISTORY_LENGTH = 8;

// Only the fields present in the body are checked and saved, so an older
// report keeps what a newer form no longer shows.
function checkFields(body) {
  const fields = {};
  const num = (key, label) => { if (body[key] !== undefined) fields[key] = checkOptionalAmount(body[key], label); };
  const count = (key, label) => { if (body[key] !== undefined) fields[key] = checkCount(body[key], label); };
  const text = (key, label, max = 2000) => { if (body[key] !== undefined) fields[key] = checkText(body[key], label, max); };
  count('jobBid', 'Job bids'); count('aiBid', 'AI training bids'); num('income', 'Income'); num('upcomingAmount', 'Upcoming amount');
  count('resumes', 'Résumés tailored'); count('forms', 'Forms filled'); num('biddingHours', 'Time bidding');
  count('contacted', 'Contacted'); count('replies', 'Replies'); count('agreed', 'Agreed to work with us');
  if (fields.biddingHours > 24) throw badRequest('Time bidding is in hours, at most 24');
  text('upcomingNote', 'Upcoming note'); text('note', 'Note'); text('bidNote', 'Bid note'); text('contactNote', 'Candidate note');
  text('channels', 'Channels', 300); text('residentsUpdate', 'Residents update'); text('issues', 'Issues'); text('planTomorrow', 'Plan for tomorrow');
  if (body.upcomingDate !== undefined) {
    const value = body.upcomingDate;
    fields.upcomingDate = value === null || value === '' ? null : checkDay(value, 'the upcoming date');
  }
  if (body.todayPlan !== undefined) {
    fields.todayPlan = checkList(body.todayPlan, "Today's plan", 100)
      .map((item) => ({ text: checkText(item?.text, 'Plan item', 300), done: item?.done === true }))
      .filter((item) => item.text);
  }
  if (body.calls !== undefined) {
    fields.calls = checkList(body.calls, 'Calls', 100).map((c) => {
      const title = checkText(c?.title, 'Call', 160);
      const result = c?.result ?? '';
      if (result && !CALL_RESULTS.includes(result)) throw badRequest('A call went well, mixed or badly');
      const time = checkText(c?.time, 'Call time', 10);
      if (time && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) throw badRequest('Call time is HH:MM');
      return { time, title, profile: checkText(c?.profile, 'Profile', 120), caller: checkText(c?.caller, 'Caller', 120), result, note: checkText(c?.note, 'Call note', 2000) };
    }).filter((c) => c.title);
  }
  return fields;
}

// The task a personal report is about must belong to the author.
async function resolveTask(req, scope) {
  if (!req.body.task || scope !== 'personal') return null;
  if (!mongoose.isValidObjectId(req.body.task)) throw badRequest('Unknown task');
  const task = await Task.findById(req.body.task);
  if (!task || String(task.owner) !== String(req.user._id)) throw badRequest('That task belongs to someone else');
  return task._id;
}

// The day's work per project: [{ task, text }], only the author's own
// projects, one entry per project, and empty boxes are dropped.
async function resolveWork(req, scope) {
  if (req.body.work === undefined) return undefined;
  if (scope !== 'personal') return [];
  const entries = new Map();
  for (const item of checkList(req.body.work, 'Work', 200)) {
    const id = String(item?.task ?? '');
    if (!mongoose.isValidObjectId(id)) throw badRequest('Unknown project');
    const text = checkText(item?.text, 'Work', 2000);
    const hours = checkOptionalAmount(item?.hours, 'Hours');
    if (hours > 24) throw badRequest('Hours on a project are at most 24');
    const count = checkCount(item?.count, 'Tasks done', 10000);
    if (text || hours || count) entries.set(id, { text, hours, count });
  }
  if (!entries.size) return [];
  const own = await Task.find({ _id: { $in: [...entries.keys()] }, owner: req.user._id }, 'price priceUnit resident').populate('resident', 'sharePercent').lean();
  if (own.length !== entries.size) throw badRequest('That project belongs to someone else');
  const byId = new Map(own.map((t) => [String(t._id), t]));
  return [...entries].map(([task, { text, hours, count }]) => {
    const t = byId.get(task);
    return { task, text, hours, count, amount: workEarnings({ price: t.price, priceUnit: t.priceUnit, residentPercent: t.resident?.sharePercent ?? 0 }, { hours, count }) };
  });
}

const POPULATE = [
  { path: 'author', select: 'name role' }, { path: 'group', select: 'name slug' },
  { path: 'task', select: 'name status' }, { path: 'work.task', select: 'name status' },
];

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
  work: (r.work ?? []).filter((w) => w.task?._id).map((w) => ({ task: { id: w.task._id, name: w.task.name, status: w.task.status }, text: w.text, hours: w.hours ?? 0, count: w.count ?? 0, amount: w.amount ?? 0, paid: Boolean(w.paidBy) })),
  // What the day's hours and tasks are worth in all (paid or not); the
  // upcoming amount above is the unpaid part.
  earned: earnedOf(r.work),
  todayPlan: r.todayPlan ?? [],
  planTomorrow: r.planTomorrow ?? '',
  calls: r.calls ?? [],
  resumes: r.resumes ?? 0,
  forms: r.forms ?? 0,
  biddingHours: r.biddingHours ?? 0,
  bidNote: r.bidNote ?? '',
  contacted: r.contacted ?? 0,
  replies: r.replies ?? 0,
  agreed: r.agreed ?? 0,
  channels: r.channels ?? '',
  contactNote: r.contactNote ?? '',
  residentsUpdate: r.residentsUpdate ?? '',
  issues: r.issues ?? '',
  note: r.note,
  sentAt: r.sentAt ?? null,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
} : null);

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

  const mine = await Report.findOne({ ...base, author: req.user._id, scope: 'personal' }).populate(POPULATE);

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

  const current = await User.find(authorFilter, 'name role status group memberId')
    .populate('group', 'name slug').lean();

  // Every personal report of the day in this role's scope, also one written
  // by someone since disabled or promoted: the totals count it, so its
  // author is listed (with a note) and the rows add up to the totals.
  const reportScope = { ...readableReportFilter(req.user) };
  if (groupFilter) reportScope.group = groupFilter;
  if (authorFilter._id) reportScope.author = authorFilter._id;

  const personalReports = await Report.find({ ...base, scope: 'personal', ...reportScope }).populate(POPULATE);
  const listed = new Set(current.map((m) => String(m._id)));
  const otherIds = personalReports.map((r) => String(r.author?._id ?? r.author)).filter((id) => !listed.has(id));
  const others = otherIds.length
    ? await User.find({ _id: { $in: otherIds } }, 'name role status group memberId').populate('group', 'name slug').lean()
    : [];
  const members = [...current, ...others].sort((a, b) => a.name.localeCompare(b.name));

  const byAuthor = new Map(personalReports.map((r) => [String(r.author?._id ?? r.author), r]));
  const rows = members.map((m) => ({
    member: {
      ...personOf(m), memberId: m.memberId,
      group: m.group ? { id: m.group._id, name: m.group.name, slug: m.group.slug } : null,
    },
    report: serialize(byAuthor.get(String(m._id))),
  }));

  // A group's report is not written by anyone: it is its members' reports
  // of the day added up (and how many of them are in).
  const groupsShown = groupFilter ? allowed.filter((g) => String(g._id) === String(groupFilter)) : allowed;
  const groupSummaries = canReadGroupReports(req.user) && !authorFilter._id
    ? groupsShown.map((g) => groupSummary(g, personalReports, current))
    : [];

  const nextKey = shiftPeriod(type, period.key, 1);
  const writer = canWritePersonal(req.user) ? await writerContext(req.user, type, period.key) : null;

  res.json({
    ...writer,
    period: {
      ...period,
      type,
      prev: shiftPeriod(type, period.key, -1),
      next: nextKey,
      hasNext: parsePeriod(type, nextKey).start <= teamNow(),
      isCurrent: period.key === periodKey(type),
    },
    can: { writePersonal: canWritePersonal(req.user) },
    mine: serialize(mine),
    // Members only fill in their own report; bosses see their group; the
    // leader and admins see everyone.
    rows: canReadGroupReports(req.user) ? rows : [],
    scope: req.user.role === 'boss' ? 'group' : (canReadGroupReports(req.user) ? 'all' : 'self'),
    groupSummaries,
    totals: { ...sumOf(personalReports), submitted: personalReports.filter((r) => r.sentAt).length, expected: members.length },
    groups: allowed.map((g) => ({ id: g._id, name: g.name, slug: g.slug })),
  });
});

// GET /api/reports/status — whether today's report is due: for the
// "Report due" button shown on every screen.
router.get('/status', async (req, res) => {
  if (!canWritePersonal(req.user)) return res.json({ canWrite: false, due: false });
  const period = periodKey('daily');
  const { start } = parsePeriod('daily', period);
  const [mine, previous] = await Promise.all([
    Report.findOne({ author: req.user._id, scope: 'personal', type: 'daily', period }, 'sentAt updatedAt todayPlan').lean(),
    Report.findOne({ author: req.user._id, scope: 'personal', type: 'daily', periodStart: { $lt: start } }, 'planTomorrow').sort({ periodStart: -1 }).lean(),
  ]);
  // Today's plan as the side panel ticks it: the report's own, or what the
  // previous report planned for today (the same rule as the report form).
  const todayPlan = mine?.todayPlan?.length
    ? mine.todayPlan.map((p) => ({ text: p.text, done: Boolean(p.done) }))
    : planLines(previous?.planTomorrow).map((text) => ({ text, done: false }));
  res.json({
    // `end` is the real moment the team's day turns over, so the client
    // can check again then.
    canWrite: true, period, start, end: teamDayEnd(),
    due: !mine?.sentAt, draft: Boolean(mine && !mine.sentAt), sentAt: mine?.sentAt ?? null, todayPlan,
  });
});

// GET /api/reports/today — for bosses, the leader and admins: who in their
// scope has sent, drafted or not written today's report.
router.get('/today', async (req, res) => {
  if (!canReadGroupReports(req.user)) return res.json({ rows: [] });
  const period = periodKey('daily');
  const members = await User.find({ ...readableAuthorFilter(req.user), status: 'active', role: { $in: ['member', 'boss'] }, _id: { $ne: req.user._id } }, 'name role group')
    .populate('group', 'name').sort('name').lean();
  const reports = await Report.find({ scope: 'personal', type: 'daily', period, author: { $in: members.map((m) => m._id) } }, 'author sentAt updatedAt').lean();
  const byAuthor = new Map(reports.map((r) => [String(r.author), r]));
  res.json({
    period,
    rows: members.map((m) => {
      const r = byAuthor.get(String(m._id));
      return { id: m._id, name: m.name, role: m.role, group: m.group?.name ?? null, state: r?.sentAt ? 'sent' : r ? 'draft' : 'missing', at: r?.sentAt ?? r?.updatedAt ?? null };
    }),
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
  const reports = await Report.find({ type, period: { $in: keys }, author: req.user._id, scope: 'personal' }).populate(POPULATE);
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
  const scope = 'personal';

  if (req.body.scope === 'group') throw badRequest("A group's report adds up its members' reports; it is not written");
  if (!canWritePersonal(req.user)) {
    throw forbidden('The team leader and admins read reports but do not write them');
  }
  if (period.start > teamNow()) throw badRequest('That period has not started yet');

  const work = await resolveWork(req, scope);
  // The hours (or tasks done) reported are what the member expects to be
  // paid for this day: the unpaid ones add up to the report's upcoming
  // amount, due on the report day. Income is only what Finance records; an
  // income record on the project settles these entries (see routes/incomes.js),
  // and saveReport keeps those marks even when an income lands mid-save.
  const fields = {
    ...checkFields(req.body),
    ...(req.body.task !== undefined ? { task: await resolveTask(req, scope) } : {}),
    // Saving without `send` keeps (or starts) a draft; `send` marks it sent.
    ...(req.body.send === true ? { sentAt: new Date() } : {}),
    periodStart: period.start,
    periodEnd: period.end,
    group: req.user.group ?? null,
  };
  const report = await saveReport({ author: req.user._id, type, period: period.key, scope }, fields, work);
  await report.populate(POPULATE);

  reportChanged(req.user, report);
  // Projects show the day's work and whether today's was written.
  taskWorkChanged(req.user._id, req.user.group ?? null);
  res.json({ report: serialize(report) });
});

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Report not found');
  const report = await Report.findById(req.params.id);
  if (!report) throw notFound('Report not found');
  const allowed = report.scope === 'group'
    ? canChangeGroupRecord(req.user, report)
    : String(report.author) === String(req.user._id);
  if (!allowed) throw forbidden('You can only delete your own report');
  await archiveDeleted(report, req, { model: 'Report', label: `${report.scope} ${report.type} report ${report.period}` });
  await report.deleteOne();
  reportChanged(req.user, report);
  res.json({ ok: true });
});

export default router;
