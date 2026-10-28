import test from 'node:test';
import assert from 'node:assert/strict';
import { accessKind, clientAddress, collectionOf, entryFromProfile, isWrite, readGate } from '../src/utils/outsideAccess.js';

const ts = new Date('2026-10-28T12:00:00Z');

test('profiled operations are sorted into kinds of access', () => {
  assert.equal(accessKind({ op: 'query', command: { find: 'outcomes', filter: {} } }), 'read');
  assert.equal(accessKind({ op: 'command', command: { aggregate: 'incomes', pipeline: [] } }), 'read');
  assert.equal(accessKind({ op: 'remove', command: { q: {} } }), 'delete');
  assert.equal(accessKind({ op: 'command', command: { findAndModify: 'tasks', remove: true } }), 'delete');
  assert.equal(accessKind({ op: 'command', command: { findAndModify: 'tasks', update: { $set: { a: 1 } } } }), 'update');
  assert.equal(accessKind({ op: 'command', command: { drop: 'reports' } }), 'drop');
  assert.equal(accessKind({ op: 'command', command: { listCollections: 1 } }), 'browse');
  // Handshakes and cursor clean-up are not access to the data.
  assert.equal(accessKind({ op: 'command', command: { hello: 1 } }), null);
  assert.equal(accessKind({ op: 'command', command: { killCursors: 'x' } }), null);
  assert.ok(isWrite('delete') && isWrite('drop') && !isWrite('read') && !isWrite('browse'));
});

test('client address and collection come out clean', () => {
  assert.equal(clientAddress('127.0.0.1:53122'), '127.0.0.1');
  assert.equal(clientAddress('[::1]:53122'), '::1');
  assert.equal(collectionOf({ ns: 'business_manager.outcomes' }), 'outcomes');
  assert.equal(collectionOf({ ns: 'business_manager.$cmd', command: { drop: 'reports' } }), 'reports');
});

test('an outside delete becomes a flagged security log entry with who and what', () => {
  const doc = {
    ts, op: 'remove', ns: 'business_manager.outcomes', client: '10.0.0.7:61000', appName: 'Studio 3T', user: 'ops',
    command: { q: { _id: { toHexString: () => 'abc', toString: () => '6ae1ea799efe2a9b8aabe8ed' } }, limit: 1 }, ndeleted: 1, millis: 3,
  };
  const e = entryFromProfile(doc, 'delete', (c) => (c === 'outcomes' ? 'Outcome' : null));
  assert.equal(e.action, 'database.delete');
  assert.equal(e.ip, '10.0.0.7');
  assert.equal(e.userAgent, 'Studio 3T');
  assert.equal(e.username, 'ops');
  assert.equal(e.path, 'outcomes');
  assert.equal(e.target.model, 'Outcome');
  assert.deepEqual(e.flags, ['outside-app', 'outside-write']);
  assert.equal(e.details.counts.deleted, 1);
});

test('writing to the security log by hand is flagged as tampering; secrets in filters are hidden', () => {
  const e = entryFromProfile({ ts, op: 'update', ns: 'db.auditlogs', command: { q: {}, u: { $set: { password: 'x' } } } }, 'update');
  assert.ok(e.flags.includes('tamper'));
  const read = entryFromProfile({ ts, op: 'query', ns: 'db.users', command: { find: 'users', filter: { passwordHash: 'abc' } } }, 'read');
  assert.equal(read.details.filter.passwordHash, '[hidden]');
  assert.deepEqual(read.flags, ['outside-app']);
});

test('repeated reads from one client are noted once per window', () => {
  const gate = readGate({ windowMs: 1000 });
  assert.equal(gate('a', 0), true);
  assert.equal(gate('a', 500), false);
  assert.equal(gate('b', 500), true);
  assert.equal(gate('a', 1500), true);
});
