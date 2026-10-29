import { Router } from 'express';
import mongoose from 'mongoose';
import AuditLog from '../models/AuditLog.js';
import DeletedRecord from '../models/DeletedRecord.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { canManage } from '../utils/memberPolicy.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';
import { actorOf } from '../utils/audit.js';
import { olderThan, NEWEST_FIRST } from '../utils/paging.js';
import { searchRegex } from '../utils/validate.js';
import { outsideWatchStatus } from '../utils/outsideWatch.js';
import {
  sessionChanged, directoryChanged, navChanged, approvalsChanged, taskChanged, residentChanged, chatAccountChanged,
  incomeChanged, outcomeChanged, reportChanged, planChanged, instructionEvent,
} from '../socket/events.js';

// Admin → Security: the security log, the records people deleted, and the
// means to end an account's sessions. Admins and the team leader only.
const router = Router();
router.use(requireAuth, (req, res, next) => {
  if (!['admin', 'leader'].includes(req.user.role)) throw forbidden('Only admins and the team leader see the security log');
  next();
});

const PAGE = 100;
const EXPORT_MAX = 5000;
const DAY = 24 * 60 * 60 * 1000;

// The "load older" cursor on the field each list is sorted by (`at` for the
// log, `deletedAt` for deleted records) instead of createdAt.
function olderOn(query, field) {
  const older = olderThan(query);
  if (!older) return null;
  if (older.createdAt) return { [field]: older.createdAt };
  return { $or: older.$or.map(({ createdAt, ...rest }) => ({ [field]: createdAt, ...rest })) };
}

// Everything is recorded, but the page lists only what is dangerous: work on
// the database outside the app, tampering, deletions and restores, refused
// or rate-limited requests and failed logins, and changes to accounts and
// access (roles, disabling, passwords, ended sessions, exports of the log).
// Ordinary logins, plain edits and reads stay in the log (it is append-only)
// but are not shown.
const ACCOUNT = /^(members\.(role|status|reset-password)|auth\.password|security\.(sign-out|export|restore))$/;
const DANGEROUS = {
  $or: [
    { flags: { $in: ['outside-app', 'tamper', 'denied', 'rate-limited'] } },
    { action: /\.delete$/ },
    { action: 'auth.login.failed' },
    { action: /^database\./ },
    { action: ACCOUNT, status: { $lt: 400 } },
  ],
};

// What each "kind" of the filter means, within the dangerous entries.
const KINDS = {
  outside: { flags: 'outside-app' },
  delete: { action: /\.delete$/ },
  restore: { action: 'security.restore' },
  failed: { $or: [{ action: 'auth.login.failed' }, { flags: 'rate-limited' }, { flags: 'denied' }] },
  account: { action: ACCOUNT },
};

function logFilter(query) {
  const and = [DANGEROUS];
  if (query.kind && query.kind !== 'all') {
    if (!Object.hasOwn(KINDS, query.kind)) throw badRequest('Unknown kind');
    and.push(KINDS[query.kind]);
  }
  if (query.user) {
    if (!mongoose.isValidObjectId(query.user)) throw badRequest('Unknown user');
    and.push({ 'user.id': query.user });
  }
  const rx = searchRegex(query.q);
  if (rx) {
    and.push({ $or: [{ 'user.name': rx }, { 'user.username': rx }, { username: rx }, { ip: rx }, { path: rx }, { action: rx }, { 'target.label': rx }] });
  }
  const older = olderOn(query, 'at');
  if (older) and.push(older);
  return { $and: and };
}

const serializeEntry = (e) => ({
  id: e._id,
  at: e.at,
  action: e.action,
  user: e.user?.id ? { id: e.user.id, name: e.user.name, username: e.user.username, role: e.user.role } : null,
  username: e.username || '',
  ip: e.ip,
  userAgent: e.userAgent,
  method: e.method,
  path: e.path,
  status: e.status,
  durationMs: e.durationMs,
  target: e.target?.id || e.target?.label ? { model: e.target.model ?? null, id: e.target.id ?? null, label: e.target.label ?? '' } : null,
  details: e.details ?? null,
  flags: e.flags ?? [],
});

// GET /api/security/overview — the numbers at the top of the page.
router.get('/overview', async (req, res) => {
  const now = Date.now();
  const since = (ms) => ({ at: { $gte: new Date(now - ms) } });
  const [today, failed, flagged, deleted, lastFailed, outside, outsideWrites] = await Promise.all([
    AuditLog.countDocuments({ ...since(DAY), ...DANGEROUS }),
    AuditLog.countDocuments({ ...since(DAY), action: 'auth.login.failed' }),
    AuditLog.countDocuments({ ...since(7 * DAY), flags: { $in: ['rate-limited', 'denied'] } }),
    DeletedRecord.countDocuments({}),
    AuditLog.find({ action: 'auth.login.failed' }).sort(NEWEST_FIRST).limit(5).lean(),
    AuditLog.countDocuments({ ...since(7 * DAY), flags: 'outside-app' }),
    AuditLog.countDocuments({ ...since(7 * DAY), flags: 'outside-write' }),
  ]);
  res.json({
    last24h: { dangerous: today, failedLogins: failed },
    last7d: { flagged, outside, outsideWrites },
    // Whether work done on the database outside the app is being recorded.
    outsideWatch: outsideWatchStatus(),
    deletedRecords: deleted,
    recentFailures: lastFailed.map(serializeEntry),
  });
});

// GET /api/security/log?kind=&user=&q=&before=&beforeId= — newest first,
// 100 at a time; `before`/`beforeId` from the oldest row shown load older ones.
router.get('/log', async (req, res) => {
  const filter = logFilter(req.query);
  const entries = await AuditLog.find(filter).sort({ at: -1, _id: -1 }).limit(PAGE + 1).lean();
  const page = entries.slice(0, PAGE);
  res.json({
    entries: page.map(serializeEntry),
    hasMore: entries.length > PAGE,
    cursor: page.length ? { before: page[page.length - 1].at, beforeId: page[page.length - 1]._id } : null,
    kinds: Object.keys(KINDS),
  });
});

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  // A cell starting with = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replaceAll('"', '""')}"`;
};

// GET /api/security/log.csv?kind=&user=&q= — the newest 5,000 matching
// entries as a spreadsheet. Exporting is itself written to the log.
router.get('/log.csv', async (req, res) => {
  const filter = logFilter(req.query);
  const entries = await AuditLog.find(filter).sort({ at: -1, _id: -1 }).limit(EXPORT_MAX).lean();
  req.audit = { action: 'security.export', details: { kind: req.query.kind ?? 'all', q: req.query.q ?? '', rows: entries.length } };
  const head = ['time', 'action', 'user', 'username', 'role', 'ip', 'device', 'method', 'path', 'status', 'target', 'flags', 'details'];
  const rows = entries.map((e) => [
    e.at.toISOString(), e.action, e.user?.name ?? '', e.user?.username ?? e.username ?? '', e.user?.role ?? '', e.ip, e.userAgent,
    e.method, e.path, e.status, e.target?.label || e.target?.id || '', (e.flags ?? []).join(' '), e.details,
  ].map(csvCell).join(','));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="security-log-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`﻿${[head.join(','), ...rows].join('\r\n')}`);
});

const serializeDeleted = (d, { withSnapshot = false } = {}) => ({
  id: d._id,
  model: d.model,
  recordId: d.recordId,
  label: d.label,
  deletedBy: d.deletedBy?.id ? { id: d.deletedBy.id, name: d.deletedBy.name, username: d.deletedBy.username, role: d.deletedBy.role } : null,
  deletedAt: d.deletedAt,
  ip: d.ip,
  reason: d.reason || '',
  files: d.files ?? [],
  restoredAt: d.restoredAt ?? null,
  restoredBy: d.restoredBy?.id ? { id: d.restoredBy.id, name: d.restoredBy.name, username: d.restoredBy.username, role: d.restoredBy.role } : null,
  ...(withSnapshot ? { snapshot: d.snapshot } : {}),
});

// GET /api/security/deleted?model=&state=&q=&before=&beforeId= — what was
// deleted, newest first, without the records themselves. `state` is `gone`
// (still deleted), `restored`, or anything else for both.
router.get('/deleted', async (req, res) => {
  const and = [];
  if (req.query.model) and.push({ model: String(req.query.model).slice(0, 40) });
  if (req.query.state === 'gone') and.push({ restoredAt: null });
  if (req.query.state === 'restored') and.push({ restoredAt: { $ne: null } });
  const rx = searchRegex(req.query.q);
  if (rx) {
    and.push({ $or: [{ label: rx }, { 'deletedBy.name': rx }, { 'deletedBy.username': rx }, { ip: rx }, { model: rx }] });
  }
  const older = olderOn(req.query, 'deletedAt');
  if (older) and.push(older);
  const filter = and.length ? { $and: and } : {};
  const [rows, models] = await Promise.all([
    DeletedRecord.find(filter, '-snapshot').sort({ deletedAt: -1, _id: -1 }).limit(PAGE + 1).lean(),
    DeletedRecord.distinct('model'),
  ]);
  const page = rows.slice(0, PAGE);
  res.json({
    records: page.map((d) => serializeDeleted(d)),
    hasMore: rows.length > PAGE,
    cursor: page.length ? { before: page[page.length - 1].deletedAt, beforeId: page[page.length - 1]._id } : null,
    models: models.sort(),
  });
});

// GET /api/security/deleted/:id — one deleted record, whole. Reading it is
// written to the log.
router.get('/deleted/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Deleted record not found');
  const d = await DeletedRecord.findById(req.params.id).lean();
  if (!d) throw notFound('Deleted record not found');
  req.audit = { action: 'security.deleted.view', target: { model: d.model, id: d.recordId, label: d.label } };
  res.json({ record: serializeDeleted(d, { withSnapshot: true }) });
});

// Tells the screens that show a restored record to reload.
function announceRestored(model, doc) {
  const owner = (field) => ({ _id: doc[field] });
  const tell = {
    Task: () => taskChanged(doc),
    Resident: () => residentChanged(doc),
    ChatAccount: () => chatAccountChanged(doc),
    Income: () => incomeChanged(doc),
    Outcome: () => outcomeChanged(doc),
    Report: () => reportChanged(owner('author'), doc),
    Plan: () => planChanged(owner('owner'), doc),
    Instruction: () => instructionEvent('instruction:changed', { ...doc, author: owner('author') }, { id: doc._id }),
    Group: () => { navChanged(); directoryChanged(); },
    User: () => { directoryChanged(); approvalsChanged(); },
  }[model];
  try { tell?.(); } catch (err) { console.error('Restore notice failed:', err.message); }
}

// POST /api/security/deleted/:id/restore — puts a deleted record back,
// exactly as it was, under its old id. The archive entry stays and is
// marked restored; the restore itself goes in the log. Refused when a
// record with that id exists again or the entry was already restored.
router.post('/deleted/:id/restore', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Deleted record not found');
  const d = await DeletedRecord.findById(req.params.id).lean();
  if (!d) throw notFound('Deleted record not found');
  if (d.restoredAt) throw conflict(`Already restored by ${d.restoredBy?.name ?? 'someone'} on ${new Date(d.restoredAt).toLocaleString()}`);
  const Model = mongoose.models[d.model];
  if (!Model) throw badRequest(`Records of type ${d.model} cannot be restored`);
  if (await Model.exists({ _id: d.recordId })) throw conflict('A record with this id exists again; nothing to restore');
  const snapshot = { ...d.snapshot, _id: d.recordId };
  // A user's snapshot never holds the password hash, so the account comes
  // back without a password: every session is ended and an admin has to
  // set a temporary one (Members → Reset password) before they can log in.
  const needsPassword = d.model === 'User';
  if (needsPassword) Object.assign(snapshot, { passwordHash: undefined, mustChangePassword: true, sessionsEndedAt: new Date() });
  await Model.collection.insertOne(snapshot);
  await DeletedRecord.markRestored(d._id, actorOf(req.user));
  req.audit = {
    action: 'security.restore',
    target: { model: d.model, id: d.recordId, label: d.label },
    details: { archived: d._id, deletedBy: d.deletedBy?.username ?? null, deletedAt: d.deletedAt },
  };
  announceRestored(d.model, snapshot);
  res.json({
    ok: true,
    needsPassword,
    message: needsPassword ? 'Account restored without a password: give it a temporary one with Reset password before they log in.' : 'Restored',
    record: serializeDeleted({ ...d, restoredAt: new Date(), restoredBy: actorOf(req.user) }),
  });
});

// POST /api/security/users/:id/sign-out — ends every session of one
// account, on every device: tokens issued before now stop working and
// their sockets are dropped. The person logs in again with their password.
router.post('/users/:id/sign-out', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('User not found');
  const user = await User.findById(req.params.id);
  if (!user) throw notFound('User not found');
  const self = String(user._id) === String(req.user._id);
  if (!self && !canManage(req.user, user)) throw forbidden('You cannot end that account\'s sessions');
  user.sessionsEndedAt = new Date();
  await user.save();
  req.audit = { action: 'security.sign-out', target: { model: 'User', id: user._id, label: `${user.name} (@${user.username})` }, details: { self } };
  // The answer goes out first, so this session's own cookie (if it is the
  // one being ended) is not refused before the client hears why.
  res.on('finish', () => setTimeout(() => sessionChanged(String(user._id), { disconnect: true }), 500));
  res.json({ ok: true, user: { id: user._id, name: user.name } });
});

export default router;
