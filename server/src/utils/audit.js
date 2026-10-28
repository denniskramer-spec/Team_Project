import AuditLog from '../models/AuditLog.js';
import DeletedRecord from '../models/DeletedRecord.js';
import { currentAudit, newAuditContext, runWithAudit } from './auditContext.js';

// The security log (Admin → Security). Every request that changes the team's
// data, every login and every refused request is written down when its
// response has gone out: who, when, from which IP and browser, what was asked
// and how it ended. Plain reads are not (they drowned out what matters);
// reads of the database from outside the app are (utils/outsideWatch.js). The data layer
// (utils/auditPlugin.js) adds every record the request created, changed
// (field by field, old and new value) or removed. Routes can say more with
// `req.audit = { action, target, details, flags }`; a delete also keeps the
// whole record (archiveDeleted) so nothing is ever lost.

export const clientIp = (req) => req.ip || req.socket?.remoteAddress || '';

export const actorOf = (user) => (user
  ? { id: user._id, name: user.name, username: user.username, role: user.role }
  : null);

const SECRET = /pass|token|secret|hash|cookie|authorization/i;
const MAX_TEXT = 500;
const MAX_ITEMS = 50;

// A copy of a request body (or anything) safe to keep: secrets hidden, long
// text and lists cut short, nested objects limited.
export function sanitize(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((v) => sanitize(v, depth + 1));
    return value.length > MAX_ITEMS ? [...items, `… ${value.length - MAX_ITEMS} more`] : items;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') return String(value); // ObjectId
    if (depth > 4) return '[…]';
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      // Operators and dots cannot be field names in MongoDB, and a key called
      // __proto__ would set this object's prototype instead of a field.
      const name = key === '__proto__' ? '_proto_' : key.replace(/^\$/, '_').replaceAll('.', '_');
      out[name] = SECRET.test(key) ? '[hidden]' : sanitize(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

const READ = new Set(['GET', 'HEAD', 'OPTIONS']);
const VERBS = { GET: 'view', HEAD: 'view', POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };
// Read receipts are sent every time a chat is opened: noise, not history.
const SKIP = [/^\/api\/chat\/[^/]+\/read$/];
const pathOf = (req) => req.originalUrl.split('?')[0];
const isId = (p) => /^[0-9a-f]{24}$/i.test(p);

// "<resource>.<verb>" from the request: POST /api/incomes -> incomes.create,
// DELETE /api/tasks/<id> -> tasks.delete, POST /api/members/<id>/approve ->
// members.approve, GET /api/outcomes -> outcomes.view.
export function actionOf(req) {
  const parts = pathOf(req).split('/').filter(Boolean); // api, resource, ...
  const resource = parts[1] ?? 'api';
  const rest = parts.slice(2).filter((p) => !isId(p));
  const verb = READ.has(req.method) ? VERBS[req.method] : rest.length ? rest[rest.length - 1] : VERBS[req.method] ?? req.method.toLowerCase();
  return `${resource}.${verb}`.slice(0, 60);
}

// What part of a resource a read looked at: GET /api/chat/general/messages
// -> "general/messages"; GET /api/incomes?period=month -> "".
export const viewOf = (req) => pathOf(req).split('/').filter(Boolean).slice(2).filter((p) => !isId(p)).join('/');

const idIn = (req) => pathOf(req).split('/').find(isId) ?? null;

function shouldLog(req, res) {
  if (req.audit) return true;
  const path = pathOf(req);
  if (!path.startsWith('/api/')) return false;
  if (req.auditCtx?.changes.length) return true;
  // A read that went through is not news; a refused one (not signed in,
  // not allowed, rate-limited) is.
  if (READ.has(req.method)) return req.method !== 'OPTIONS' && [401, 403, 429].includes(res.statusCode);
  if (path === '/api/health') return false;
  return !SKIP.some((rx) => rx.test(path));
}

function detailsOf(req, res, extra) {
  const changes = req.auditCtx?.changes ?? [];
  const base = extra.details !== undefined
    ? sanitize(extra.details)
    : READ.has(req.method)
      ? { ...(viewOf(req) ? { of: viewOf(req) } : {}), ...(req.query && Object.keys(req.query).length ? { query: sanitize(req.query) } : {}) }
      : (req.body && Object.keys(req.body).length ? sanitize(req.body) : null);
  if (!changes.length) return base && Object.keys(base).length ? base : null;
  const out = base && typeof base === 'object' && !Array.isArray(base) ? { ...base } : base ? { request: base } : {};
  out.changes = changes.map((c) => sanitize(c));
  if (req.auditCtx.more) out.moreChanges = req.auditCtx.more;
  return out;
}

function targetOf(req, extra) {
  if (extra.target) return extra.target;
  const changes = req.auditCtx?.changes ?? [];
  const id = idIn(req);
  const match = changes.find((c) => String(c.id) === id) ?? (id ? null : changes[0]);
  if (match) return { model: match.model, id: match.id, label: match.label };
  return id ? { id } : null;
}

// Express middleware, mounted before the routes. Opens the audit context the
// data layer writes into and, once the response is out, writes the entry.
export function auditRequests(req, res, next) {
  const started = Date.now();
  const ctx = newAuditContext(req);
  req.auditCtx = ctx;
  res.on('finish', () => {
    if (!shouldLog(req, res)) return;
    const extra = req.audit ?? {};
    const flags = [...(extra.flags ?? [])];
    if (res.statusCode === 429) flags.push('rate-limited');
    if (res.statusCode === 401 || res.statusCode === 403) flags.push('denied');
    const entry = {
      at: new Date(),
      action: extra.action ?? `${actionOf(req)}${res.statusCode >= 400 ? '.failed' : ''}`.slice(0, 60),
      user: actorOf(req.user),
      username: extra.username ?? '',
      ip: clientIp(req),
      userAgent: String(req.get('user-agent') ?? '').slice(0, 300),
      method: req.method,
      path: req.originalUrl.slice(0, 300),
      status: res.statusCode,
      durationMs: Date.now() - started,
      target: targetOf(req, extra),
      details: detailsOf(req, res, extra),
      flags,
    };
    AuditLog.create(entry).catch((err) => console.error('Security log write failed:', err.message));
  });
  runWithAudit(ctx, next);
}

// Writes an entry outside a request (a scheduled job, a socket event).
export const recordAudit = (entry) => AuditLog.create({ at: new Date(), ...entry })
  .catch((err) => console.error('Security log write failed:', err.message));

// Every uploaded file a record points to, wherever the model keeps them.
export function filesOf(snapshot) {
  const files = [];
  const walk = (v) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v.file === 'string' && /^[0-9]+-[0-9a-f]{12}\.\w+$/.test(v.file)) files.push(v.file);
    Object.values(v).forEach(walk);
  };
  walk(snapshot);
  return [...new Set(files)];
}

const plain = (doc) => (typeof doc.toObject === 'function'
  ? doc.toObject({ depopulate: true, flattenMaps: true, versionKey: false })
  : doc);

// Keeps a whole copy of each record about to be deleted and notes the
// deletion in the security log. Call it before the delete itself. (The data
// layer calls it on its own for any delete a route did not announce.)
//   docs    one document or a list
//   model   the model's name ('Outcome', 'Task', ...)
//   label   what to call the record(s) in the log (a name, a title, ...)
//   reason  why, when the app removed it rather than a person
export async function archiveDeleted(docs, req, { model, label = '', reason = '' }) {
  const ctx = currentAudit() ?? req?.auditCtx ?? null;
  const list = (Array.isArray(docs) ? docs : [docs]).filter((d) => d && !ctx?.archived.has(String(d._id)));
  if (!list.length) return [];
  list.forEach((d) => ctx?.archived.add(String(d._id)));
  const by = actorOf(req?.user);
  const ip = req ? clientIp(req) : '';
  const entries = await DeletedRecord.insertMany(list.map((doc) => {
    const snapshot = plain(doc);
    return {
      model, recordId: doc._id, label: String(label).slice(0, 200), snapshot, files: filesOf(snapshot),
      deletedBy: by, deletedAt: new Date(), ip, reason,
    };
  }));
  entries.forEach((e, i) => ctx?.changes.push({ op: 'delete', model, id: list[i]._id, label: e.label, archived: e._id, ...(reason ? { reason } : {}) }));
  if (req) {
    req.audit = {
      ...req.audit,
      action: req.audit?.action ?? `${model.toLowerCase()}.delete`,
      target: req.audit?.target ?? { model, id: list[0]._id, label: String(label).slice(0, 200) },
      details: { ...req.audit?.details, archived: [...(req.audit?.details?.archived ?? []), ...entries.map((e) => e._id)], records: (req.audit?.details?.records ?? 0) + list.length, ...(reason ? { reason } : {}) },
    };
  }
  return entries;
}
