import { sanitize } from './audit.js';

// Turning what MongoDB's profiler saw from a client other than the app (a GUI
// tool such as MongoChef / Studio 3T, a shell, another program) into
// security log entries. Pure functions; utils/outsideWatch.js does the I/O.

// What kind of access a profiled operation was, or null for chatter that is
// not access to the data (handshakes, pings, cursor clean-up).
const COMMANDS = {
  find: 'read', aggregate: 'read', count: 'read', distinct: 'read', getMore: 'read', explain: 'read',
  listCollections: 'browse', listIndexes: 'browse', collStats: 'browse', dbStats: 'browse',
  insert: 'insert', update: 'update', findAndModify: 'update', delete: 'delete',
  drop: 'drop', dropDatabase: 'drop', renameCollection: 'drop', create: 'schema', createIndexes: 'schema',
  dropIndexes: 'schema', collMod: 'schema', profile: 'profiling',
};
const OPS = { query: 'read', getmore: 'read', insert: 'insert', update: 'update', remove: 'delete' };

export function accessKind(doc) {
  if (doc.op !== 'command') return OPS[doc.op] ?? null;
  const name = Object.keys(doc.command ?? {})[0];
  if (name === 'findAndModify' || name === 'findandmodify') return doc.command.remove ? 'delete' : 'update';
  return COMMANDS[name] ?? null;
}

// Reads say who looked; writes, deletes and schema changes are what matter most.
export const isWrite = (kind) => !['read', 'browse'].includes(kind);

// "127.0.0.1:53122" / "[::1]:53122" -> the address without the port.
export const clientAddress = (client = '') => String(client).replace(/^\[(.*)\](:\d+)?$/, '$1').replace(/^([^:]+):\d+$/, '$1');

// The collection an operation was on ("db.coll" -> "coll").
export const collectionOf = (doc) => {
  const fromNs = String(doc.ns ?? '').split('.').slice(1).join('.');
  const cmd = doc.command ?? {};
  const named = cmd[Object.keys(cmd)[0]];
  return fromNs && fromNs !== '$cmd' ? fromNs : typeof named === 'string' ? named : '';
};

// The filter or update an operation used, safe to keep (secrets hidden, long
// values cut), so the log says what was looked at or changed.
function whatOf(doc) {
  const c = doc.command ?? {};
  const out = {};
  const filter = c.filter ?? c.query ?? c.q ?? c.updates?.[0]?.q ?? c.deletes?.[0]?.q;
  if (filter && Object.keys(filter).length) out.filter = sanitize(filter);
  const update = c.update ?? c.updates?.[0]?.u;
  if (update && typeof update === 'object') out.update = sanitize(update);
  if (c.pipeline) out.pipeline = sanitize(c.pipeline);
  const many = c.updates?.[0]?.multi || (c.deletes?.[0] && c.deletes[0].limit === 0);
  if (many) out.many = true;
  const counts = {
    returned: doc.nreturned, examined: doc.docsExamined, inserted: doc.ninserted,
    modified: doc.nModified, deleted: doc.ndeleted ?? doc.keysDeleted,
  };
  const known = Object.fromEntries(Object.entries(counts).filter(([, v]) => Number.isFinite(v)));
  if (Object.keys(known).length) out.counts = known;
  return out;
}

// An `_id` the operation named, when it named exactly one.
function idOf(doc) {
  const c = doc.command ?? {};
  const filter = c.filter ?? c.query ?? c.q ?? c.updates?.[0]?.q ?? c.deletes?.[0]?.q ?? {};
  const id = filter._id;
  return id && typeof id === 'object' && typeof id.toHexString === 'function' ? String(id) : (typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id) ? id : null);
}

// The security log entry for one profiled operation (see models/AuditLog.js).
//   modelFor  collection name -> the app's model name ('outcomes' -> 'Outcome')
export function entryFromProfile(doc, kind, modelFor = () => null) {
  const collection = collectionOf(doc);
  const model = modelFor(collection);
  const flags = ['outside-app'];
  if (isWrite(kind)) flags.push('outside-write');
  // Someone editing the security log or the kept copies by hand.
  if (['auditlogs', 'deletedrecords'].includes(collection) && isWrite(kind)) flags.push('tamper');
  if (doc.errCode || doc.ok === 0) flags.push('failed');
  const id = idOf(doc);
  return {
    at: doc.ts ?? new Date(),
    action: `database.${kind}`,
    user: null,
    // The database user the tool logged in as (empty without access control).
    username: String(doc.user ?? '').slice(0, 60),
    ip: clientAddress(doc.client),
    userAgent: String(doc.appName || 'unknown database client').slice(0, 300),
    method: 'DB',
    path: collection.slice(0, 300),
    status: doc.errCode || doc.ok === 0 ? 500 : 200,
    durationMs: doc.millis ?? 0,
    target: model || id ? { model, id, label: collection } : null,
    details: { op: doc.op === 'command' ? Object.keys(doc.command ?? {})[0] : doc.op, collection, ...whatOf(doc) },
    flags,
  };
}

// Reads from one client on one collection are noted once per window, not for
// every page a tool fetches; writes are always noted.
export function readGate({ windowMs = 10 * 60 * 1000, max = 5000 } = {}) {
  const seen = new Map();
  return (key, now = Date.now()) => {
    if (seen.has(key) && now - seen.get(key) < windowMs) return false;
    if (seen.size >= max) seen.clear();
    seen.set(key, now);
    return true;
  };
}
