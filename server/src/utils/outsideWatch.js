import mongoose from 'mongoose';
import DeletedRecord from '../models/DeletedRecord.js';
import Setting from '../models/Setting.js';
import { APP_NAMES } from '../config/db.js';
import { filesOf, writeAudit } from './audit.js';
import { labelOf } from './auditPlugin.js';
import { accessKind, collectionOf, entryFromProfile, isWrite, readGate } from './outsideAccess.js';

// Watching the database for work done outside the app: someone opening it
// with a GUI tool (MongoChef / Studio 3T, Compass), a shell or another
// program, rather than through the app's screens.
//
// 1. MongoDB's profiler records every operation whose client is not the app
//    (the app's connections name themselves, config/db.js). The entries are
//    read as they come and written to the security log with the client's
//    address, database user and program, and what it read or changed. If
//    someone turns the profiler off, that is logged and it is turned back on.
// 2. On a replica set, a change stream sees every delete with the record as
//    it was. A delete in a collection where the profiler just saw an outside
//    client delete is kept in Deleted records, restorable like any other.
//
// Neither needs anything from the people using the tool. MongoDB cannot
// tell a read from a tool that never reaches this database, and a client
// could pretend to be the app by using its name: see the README.

const STATE_KEY = 'outsideWatch';
const RETRY_MS = 3000;
const CHECK_MS = 60 * 1000;
// How long after an outside delete its records are matched to it.
const DELETE_MATCH_MS = 2 * 60 * 1000;
// Collections the app empties on its own (expiring entries) or that hold no
// one's data.
const SKIP_COLLECTIONS = new Set(['system.profile']);
const SECRET = /pass|token|secret|hash/i;

const status = { profiler: 'starting', deletes: 'starting', since: null, note: '' };
export const outsideWatchStatus = () => ({ ...status });

let stopped = false;
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms).unref?.(); });
const log = (entry) => writeAudit(entry);

// collection name -> model name, for the app's own collections.
function modelFor(collection) {
  for (const name of mongoose.modelNames()) {
    if (mongoose.model(name).collection.collectionName === collection) return name;
  }
  return null;
}

// Where the watch got to, so a restart picks up what happened meanwhile.
let saved = null;
let saveTimer = null;
async function loadState() {
  saved = (await Setting.findOne({ key: STATE_KEY }).lean())?.value ?? {};
}
function saveState(patch) {
  saved = { ...saved, ...patch };
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    Setting.collection.updateOne({ key: STATE_KEY }, { $set: { value: saved, updatedAt: new Date() } }, { upsert: true })
      .catch((err) => console.error('Outside watch state not saved:', err.message));
  }, 2000);
  saveTimer.unref?.();
}

// --- 1. The profiler -------------------------------------------------------

const PROFILE = (db) => db.command({ profile: 1, filter: { appName: { $nin: APP_NAMES } } });

// Outside deletes seen lately, per collection, for the change stream to match.
const outsideDeletes = new Map();
const gate = readGate();

async function recordProfile(doc) {
  const kind = accessKind(doc);
  if (!kind) return;
  const collection = collectionOf(doc);
  if (SKIP_COLLECTIONS.has(collection)) return;
  if (kind === 'delete' || kind === 'drop') {
    outsideDeletes.set(collection, { at: Date.now(), doc });
  }
  if (!isWrite(kind) && !gate(`${doc.client}|${doc.appName}|${collection}|${kind}`)) return;
  await log(entryFromProfile(doc, kind, modelFor));
}

async function tailProfile(db) {
  let since = saved.profileTs ? new Date(saved.profileTs) : new Date();
  while (!stopped) {
    try {
      // system.profile is a capped collection: a tailable cursor waits for
      // new entries. It ends when the collection is empty or recreated.
      const cursor = db.collection('system.profile').find({ ts: { $gt: since } }, { tailable: true, awaitData: true, maxAwaitTimeMS: 5000 });
      for await (const doc of cursor) {
        since = doc.ts;
        await recordProfile(doc);
        saveState({ profileTs: since });
        if (stopped) break;
      }
    } catch (err) {
      if (!stopped && !/closed|interrupted|tailable cursor requested on non capped|ns does not exist/i.test(err.message)) {
        console.error('Outside watch (profiler):', err.message);
      }
    }
    await sleep(RETRY_MS);
  }
}

// Someone (or a restarted database) turned the profiler off: note it and
// turn it back on.
async function checkProfiler(db) {
  try {
    const { was, filter } = await db.command({ profile: -1 });
    if (was === 1 && filter) return;
    await log({
      at: new Date(), action: 'database.profiling', user: null, ip: '', userAgent: 'MongoDB', method: 'DB', path: '',
      status: 200, details: { found: { level: was, filter: filter ?? null }, done: 'turned back on' }, flags: ['outside-app', 'tamper'],
    });
    await PROFILE(db);
  } catch (err) {
    console.error('Outside watch (profiler check):', err.message);
  }
}

// --- 2. Deletes on a replica set ------------------------------------------

const plainCopy = (value) => {
  if (Array.isArray(value)) return value.map(plainCopy);
  if (value && typeof value === 'object' && !(value instanceof Date) && typeof value.toHexString !== 'function' && !Buffer.isBuffer(value)) {
    return Object.fromEntries(Object.entries(value).filter(([k]) => !SECRET.test(k)).map(([k, v]) => [k, plainCopy(v)]));
  }
  return value;
};

async function keepOutsideDelete(event) {
  const collection = event.ns?.coll;
  const id = event.documentKey?._id;
  // Give the profiler a moment: its entry for the same delete may land after
  // the change event.
  await sleep(1500);
  const seen = outsideDeletes.get(collection);
  if (!seen || Date.now() - seen.at > DELETE_MATCH_MS) return; // the app's own delete
  const model = modelFor(collection);
  if (!model || !id || typeof id.toHexString !== 'function') return;
  if (await DeletedRecord.exists({ recordId: id, model, deletedAt: { $gte: new Date(Date.now() - DELETE_MATCH_MS) } })) return;
  const before = event.fullDocumentBeforeChange;
  const snapshot = before ? plainCopy(before) : { _id: id, note: 'MongoDB kept no copy of this record' };
  const label = before ? labelOf(model, before) : String(id);
  const tool = seen.doc.appName || 'a database client';
  const entry = await DeletedRecord.create({
    model, recordId: id, label: String(label).slice(0, 200), snapshot, files: filesOf(snapshot),
    deletedBy: null, deletedAt: new Date(), ip: String(seen.doc.client ?? '').replace(/:\d+$/, '').slice(0, 64),
    reason: `Deleted outside the app (${tool}${seen.doc.user ? `, database user ${seen.doc.user}` : ''})`.slice(0, 200),
  });
  await log({
    at: new Date(), action: 'database.delete.kept', user: null, username: String(seen.doc.user ?? '').slice(0, 60),
    ip: entry.ip, userAgent: tool.slice(0, 300), method: 'DB', path: collection,
    status: 200, target: { model, id, label: entry.label }, details: { archived: entry._id, copy: Boolean(before) },
    flags: ['outside-app', 'outside-write'],
  });
}

async function watchDeletes(db) {
  // Each collection of the app's must keep the record as it was before a
  // change, or the change stream cannot hand it over.
  const watched = [];
  for (const name of mongoose.modelNames()) {
    const coll = mongoose.model(name).collection.collectionName;
    const indexes = await db.collection(coll).indexes().catch(() => []);
    if (indexes.some((i) => i.expireAfterSeconds !== undefined)) continue; // expires on its own
    try {
      await db.command({ collMod: coll, changeStreamPreAndPostImages: { enabled: true } });
      watched.push(coll);
    } catch (err) {
      if (!/ns does not exist|NamespaceNotFound/i.test(err.message)) throw err;
    }
  }
  while (!stopped) {
    try {
      const options = { fullDocumentBeforeChange: 'whenAvailable', ...(saved.resumeToken ? { startAfter: saved.resumeToken } : {}) };
      const stream = db.watch([{ $match: { operationType: 'delete', 'ns.coll': { $in: watched } } }], options);
      for await (const event of stream) {
        keepOutsideDelete(event).catch((err) => console.error('Outside watch (delete):', err.message));
        saveState({ resumeToken: event._id });
        if (stopped) break;
      }
    } catch (err) {
      if (stopped) break;
      // Too far behind to resume (the database's history moved on): start fresh.
      if (/resume|history|ChangeStreamHistoryLost|ChangeStreamFatalError/i.test(err.message)) saveState({ resumeToken: null });
      else if (!/closed|interrupted/i.test(err.message)) console.error('Outside watch (deletes):', err.message);
    }
    await sleep(RETRY_MS);
  }
}

// Starts both watches once the database is connected. Whatever this
// database or user does not allow is reported on the Security page instead.
export async function startOutsideWatch() {
  const { db } = mongoose.connection;
  stopped = false;
  mongoose.connection.once('close', () => { stopped = true; });
  await loadState();
  status.since = new Date();

  try {
    await PROFILE(db);
    status.profiler = 'on';
    tailProfile(db);
    setInterval(() => checkProfiler(db), CHECK_MS).unref();
  } catch (err) {
    status.profiler = 'off';
    status.note = `The database refused to record outside access (${err.message}). The app's database user needs the dbAdmin role on this database.`;
    console.warn(`Outside watch: profiler unavailable: ${err.message}`);
  }

  try {
    const hello = await db.admin().command({ hello: 1 });
    if (!hello.setName) {
      status.deletes = 'off';
      status.note ||= 'MongoDB is not running as a replica set, so records deleted outside the app cannot be kept (see the README).';
      return;
    }
    status.deletes = 'on';
    watchDeletes(db).catch((err) => {
      status.deletes = 'off';
      status.note ||= `Records deleted outside the app cannot be kept: ${err.message}`;
      console.error('Outside watch (deletes):', err.message);
    });
  } catch (err) {
    status.deletes = 'off';
    console.warn(`Outside watch: ${err.message}`);
  }
}
