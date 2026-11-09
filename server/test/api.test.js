// The routes, end to end: a real Express app on a real (in-memory) MongoDB,
// driven over HTTP with the session cookie, as the browser does. Covers
// what the unit tests cannot: who may do what, what the security log keeps,
// and how income settles reported work.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET ??= 'route-tests-only-'.repeat(3);
process.env.UPLOADS_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), 'bm-test-uploads-'));
// This machine's own mongod, when it has one, spares the download.
if (!process.env.MONGOMS_SYSTEM_BINARY && fs.existsSync('/usr/bin/mongod')) process.env.MONGOMS_SYSTEM_BINARY = '/usr/bin/mongod';

const PASSWORD = 'Harbor-Quill-2291';
const DAY = 24 * 60 * 60 * 1000;
const today = () => new Date().toISOString().slice(0, 10);

let mongod; let server; let base; let mongoose;
let User; let Group; let AuditLog; let Report; let ExchangeRate;
const people = {};

// A logged-in client: every call carries the session cookie.
async function login(username) {
  const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: PASSWORD }) });
  assert.equal(res.status, 200, `login ${username}: ${await res.text()}`);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const call = (method) => async (p, body) => {
    const r = await fetch(`${base}${p}`, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };
  return { get: call('GET'), post: call('POST'), put: call('PUT'), patch: call('PATCH'), del: call('DELETE') };
}

// The security log is written after the response has gone out.
async function logEntry(filter, tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    const found = await AuditLog.findOne(filter).sort({ at: -1 }).lean();
    if (found) return found;
    await new Promise((r) => { setTimeout(r, 50); });
  }
  return null;
}

async function person(username, role, group = null) {
  const u = new User({ username, name: username[0].toUpperCase() + username.slice(1), role, group, status: 'active' });
  await u.setPassword(PASSWORD);
  await u.save();
  people[username] = u;
  return u;
}

before(async () => {
  mongod = await MongoMemoryServer.create();
  mongoose = (await import('mongoose')).default;
  await mongoose.connect(mongod.getUri('bm_test'));
  const app = (await import('../src/app.js')).default;
  ({ default: User } = await import('../src/models/User.js'));
  ({ default: Group } = await import('../src/models/Group.js'));
  ({ default: AuditLog } = await import('../src/models/AuditLog.js'));
  ({ default: Report } = await import('../src/models/Report.js'));
  ({ default: ExchangeRate } = await import('../src/models/ExchangeRate.js'));
  await (await import('../src/routes/settings.js')).loadSettings();
  await ExchangeRate.create({ base: 'USD', rates: { EUR: 0.8 }, source: 'test', rateDate: today(), fetchedAt: new Date() });
  await (await import('../src/utils/exchange.js')).loadRates();

  const group = await new Group({ name: 'Group1' }).save();
  await person('admin', 'admin');
  await person('admin2', 'admin');
  await person('lena', 'leader');
  await person('bruno', 'boss', group._id);
  await person('mina', 'member', group._id);
  await person('omar', 'member', group._id);
  await person('tess', 'member', group._id); // reset by the leader below

  server = http.createServer(app);
  await new Promise((r) => { server.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((r) => { server.close(r); });
  await mongoose.disconnect();
  await mongod.stop();
});

test('a wrong password is refused and a right one sets the session cookie', async () => {
  const bad = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'mina', password: 'nope-nope-1' }) });
  assert.equal(bad.status, 401);
  const mina = await login('mina');
  const me = await mina.get('/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.username, 'mina');
  assert.equal(me.body.user.passwordHash, undefined);
});

test('an anonymous request is logged only when refused, and never with its body', async () => {
  const marker = `anon-${Date.now()}`;
  const denied = await fetch(`${base}/members`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: marker, blob: 'x'.repeat(2000) }) });
  assert.equal(denied.status, 401);
  const entry = await logEntry({ path: '/api/members', status: 401 });
  assert.ok(entry, 'the refusal is in the log');
  assert.equal(JSON.stringify(entry.details ?? null).includes(marker), false, 'without the body');
  const nowhere = await fetch(`${base}/no-such-route-${marker}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":1}' });
  assert.equal(nowhere.status, 404);
  await new Promise((r) => { setTimeout(r, 300); });
  assert.equal(await AuditLog.findOne({ path: `/api/no-such-route-${marker}` }).lean(), null, 'a wrong path by nobody is not logged');
});

test('a logged-in write is logged with its (sanitized) body, cut to size', async () => {
  const mina = await login('mina');
  const res = await mina.patch('/auth/profile', { name: 'Mina Park', password: 'secret-should-hide-1', pad: 'y'.repeat(40000) });
  assert.equal(res.status, 200);
  const entry = await logEntry({ path: '/api/auth/profile', 'user.username': 'mina' });
  assert.ok(entry);
  assert.ok(Buffer.byteLength(JSON.stringify(entry.details)) <= 16 * 1024, 'details are capped');
  assert.equal(JSON.stringify(entry.details).includes('secret-should-hide'), false);
});

test('ids must be the text of an ObjectId: anything else is simply not found', async () => {
  const mina = await login('mina');
  assert.equal((await mina.get('/users/5/peek')).status, 404);
  assert.equal((await mina.get('/users/xxxxxxxxxxxx/peek')).status, 404);
  assert.equal((await mina.get(`/users/${people.omar._id}/peek`)).status, 200);
});

test("an admin's password is reset by admins only; a reset login is flagged", async () => {
  const lena = await login('lena');
  const admin = await login('admin');
  assert.equal((await lena.post(`/members/${people.admin._id}/reset-password`)).status, 403);
  assert.equal((await lena.post(`/members/${people.tess._id}/reset-password`)).status, 200);
  const reset = await admin.post(`/members/${people.admin2._id}/reset-password`);
  assert.equal(reset.status, 200);
  assert.ok(reset.body.tempPassword);
  const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin2', password: reset.body.tempPassword }) });
  assert.equal(res.status, 200);
  const entry = await logEntry({ action: 'auth.login', 'user.username': 'admin2' });
  assert.ok(entry.flags.includes('reset-login'));
});

test('a member cannot change roles, and nobody sees the last login of accounts they do not manage', async () => {
  const mina = await login('mina');
  assert.equal((await mina.patch(`/members/${people.omar._id}/role`, { role: 'admin' })).status, 403);
  const list = await mina.get('/members');
  assert.equal(list.status, 200);
  const omar = list.body.members.find((m) => m.username === 'omar');
  assert.equal(omar.lastLoginAt, null);
  const lena = await login('lena');
  const seen = (await lena.get('/members')).body.members.find((m) => m.username === 'mina');
  assert.ok(seen.lastLoginAt);
});

test('a direct message is kept out of the security log', async () => {
  const mina = await login('mina');
  const secret = `between-us-${Date.now()}`;
  const sent = await mina.post(`/chat/dm-${people.omar._id}/messages`, { content: secret });
  assert.equal(sent.status, 201);
  const entry = await logEntry({ path: `/api/chat/dm-${people.omar._id}/messages`, 'user.username': 'mina' });
  assert.ok(entry, 'the send is logged');
  assert.equal(JSON.stringify(entry).includes(secret), false, 'without the text');
  const edited = await mina.patch(`/chat/messages/${sent.body.message.id}`, { content: `${secret}-edited` });
  assert.equal(edited.status, 200);
  const edit = await logEntry({ path: `/api/chat/messages/${sent.body.message.id}`, method: 'PATCH' });
  assert.equal(JSON.stringify(edit).includes(secret), false);
  // Someone outside the DM cannot read it.
  const bruno = await login('bruno');
  assert.equal((await bruno.get(`/chat/messages/${sent.body.message.id}/reactions`)).status, 404);
});

// --- Money -----------------------------------------------------------------

async function project(client, body) {
  const res = await client.post('/tasks', { name: 'Project', price: 50, priceUnit: 'hour', currency: 'USD', startDate: today(), ...body });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.task;
}

async function reportHours(client, task, hours, daysAgo = 0) {
  const period = new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);
  const res = await client.put('/reports', { type: 'daily', period, work: [{ task: task.id, text: 'work', hours }] });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.report;
}

test('work on a project priced in another currency is kept in the base', async () => {
  const mina = await login('mina');
  const task = await project(mina, { name: 'EUR project', currency: 'EUR', price: 40 });
  const report = await reportHours(mina, task, 2, 20);
  // 2 h × EUR 40 = EUR 80 → USD 100 at 0.8 EUR per USD.
  assert.equal(report.work[0].amount, 100);
});

test('an income settles the days it pays for, oldest first; the rest stay upcoming', async () => {
  const lena = await login('lena');
  const mina = await login('mina');
  const task = await project(mina, { name: 'Five days', price: 50 });
  for (const back of [5, 4, 3, 2, 1]) await reportHours(mina, task, 8, back); // 5 × 400
  const before = await mina.get(`/incomes/upcoming?task=${task.id}`);
  assert.equal(before.body.amount, 2000);

  const income = (body) => lena.post('/incomes', { member: String(people.mina._id), date: today(), currency: 'USD', method: 'cash', task: task.id, ...body });
  // Far from what is expected: a reason is required.
  assert.equal((await income({ amount: 500 })).status, 400);
  const first = await income({ amount: 500, varianceReason: 'first instalment' });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.settled, 1);
  assert.equal((await mina.get(`/incomes/upcoming?task=${task.id}`)).body.amount, 1600);

  // The rest, exactly: no reason needed, everything settled.
  const second = await income({ amount: 1600 });
  assert.equal(second.status, 201, JSON.stringify(second.body));
  assert.equal(second.body.settled, 4);
  assert.equal((await mina.get(`/incomes/upcoming?task=${task.id}`)).body.amount, 0);

  // A paid day keeps its hours and amount when the report is saved again.
  const period = new Date(Date.now() - 5 * DAY).toISOString().slice(0, 10);
  const resaved = await mina.put('/reports', { type: 'daily', period, work: [{ task: task.id, text: 'changed my mind', hours: 1 }] });
  assert.equal(resaved.status, 200);
  assert.equal(resaved.body.report.work[0].hours, 8);
  assert.equal(resaved.body.report.work[0].amount, 400);
  const dropped = await mina.put('/reports', { type: 'daily', period, work: [] });
  assert.equal(dropped.body.report.work.length, 1, 'leaving a paid day out of the form keeps it');
});

test('income for no project while work waits to be paid needs a reason and is flagged', async () => {
  const mina = await login('mina');
  const task = await project(mina, { name: 'Open work', price: 50 });
  await reportHours(mina, task, 4, 30); // 200 upcoming
  const unpaid = await mina.get('/incomes/unpaid');
  assert.ok(unpaid.body.amount >= 200);
  const plain = await mina.post('/incomes', { amount: 90, date: today(), currency: 'USD', method: 'cash' });
  assert.equal(plain.status, 400);
  assert.match(plain.body.message, /no project/);
  const explained = await mina.post('/incomes', { amount: 90, date: today(), currency: 'USD', method: 'cash', varianceReason: 'a tip, not project work' });
  assert.equal(explained.status, 201, JSON.stringify(explained.body));
  assert.equal(explained.body.income.status, 'pending');
  assert.ok(explained.body.income.variance);
});

test('an approve and a reject at the same moment: exactly one lands', async () => {
  const lena = await login('lena');
  const bruno = await login('bruno');
  const mina = await login('mina');
  const task = await project(mina, { name: 'Decided', price: 50 });
  await reportHours(mina, task, 2, 40);
  const recorded = await mina.post('/incomes', { amount: 100, date: today(), currency: 'USD', method: 'cash', task: task.id });
  assert.equal(recorded.status, 201, JSON.stringify(recorded.body));
  const id = recorded.body.income.id;
  const [a, b] = await Promise.all([lena.post(`/incomes/${id}/approve`), bruno.post(`/incomes/${id}/reject`, { reason: 'no' })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 400]);
  const upcoming = (await mina.get(`/incomes/upcoming?task=${task.id}`)).body.amount;
  assert.equal(upcoming, a.status === 200 ? 0 : 100, 'the work follows the decision that landed');
  // A decided record cannot be withdrawn any more.
  assert.notEqual((await mina.post(`/incomes/${id}/withdraw`)).status, 200);
});

test("a project's owner cannot change while they have unpaid work on it, and its resident must be theirs", async () => {
  const lena = await login('lena');
  const mina = await login('mina');
  const omar = await login('omar');
  const task = await project(lena, { name: 'Moving', owner: String(people.mina._id), price: 50 });
  await reportHours(mina, task, 1, 50);
  const moved = await lena.patch(`/tasks/${task.id}`, { owner: String(people.omar._id) });
  assert.equal(moved.status, 409);
  const resident = await omar.post('/residents', { name: 'Omar resident', sharePercent: 10 });
  assert.equal(resident.status, 201, JSON.stringify(resident.body));
  const wrong = await lena.patch(`/tasks/${task.id}`, { resident: resident.body.resident.id });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.message, /someone else/);
});
