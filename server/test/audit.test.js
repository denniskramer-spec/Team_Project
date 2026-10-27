import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, actionOf, filesOf, viewOf } from '../src/utils/audit.js';
import { diffRecords, labelOf } from '../src/utils/auditPlugin.js';

test('what goes in the security log hides secrets and keeps the rest', () => {
  const out = sanitize({ username: 'lena', password: 'demo1234', nested: { token: 'abc', note: 'x' }, list: [1, 2] });
  assert.deepEqual(out, { username: 'lena', password: '[hidden]', nested: { token: '[hidden]', note: 'x' }, list: [1, 2] });
  // Long text and long lists are cut short, never dropped.
  assert.equal(sanitize('a'.repeat(600)).length, 501);
  const many = sanitize(Array.from({ length: 60 }, (_, i) => i));
  assert.equal(many.length, 51);
  assert.equal(many[50], '… 10 more');
  // Keys MongoDB would refuse are made plain.
  assert.deepEqual(sanitize({ $set: { 'a.b': 1 } }), { _set: { a_b: 1 } });
});

test('an action is named after the resource and what was done to it', () => {
  const id = 'a'.repeat(24);
  assert.equal(actionOf({ method: 'POST', originalUrl: '/api/incomes' }), 'incomes.create');
  assert.equal(actionOf({ method: 'DELETE', originalUrl: `/api/tasks/${id}` }), 'tasks.delete');
  assert.equal(actionOf({ method: 'PATCH', originalUrl: `/api/outcomes/${id}?x=1` }), 'outcomes.update');
  assert.equal(actionOf({ method: 'POST', originalUrl: `/api/members/${id}/approve` }), 'members.approve');
  assert.equal(actionOf({ method: 'POST', originalUrl: '/api/auth/login' }), 'auth.login');
  // A read is a view of the resource, whatever part of it was asked for.
  assert.equal(actionOf({ method: 'GET', originalUrl: '/api/incomes?type=month' }), 'incomes.view');
  assert.equal(actionOf({ method: 'GET', originalUrl: `/api/chat/general/messages?before=${id}` }), 'chat.view');
  assert.equal(viewOf({ method: 'GET', originalUrl: `/api/chat/general/messages?before=${id}` }), 'general/messages');
  assert.equal(viewOf({ method: 'GET', originalUrl: `/api/tasks/${id}` }), '');
});

test('an edit is kept field by field, old value and new, secrets hidden', () => {
  const before = { _id: 'x', name: 'Proton', price: 90, note: '', passwordHash: 'a', updatedAt: new Date('2026-01-01') };
  const after = { _id: 'x', name: 'Proton', price: 120, note: 'late', passwordHash: 'b', updatedAt: new Date('2026-02-01') };
  assert.deepEqual(diffRecords(before, after), {
    price: { from: 90, to: 120 },
    note: { from: '', to: 'late' },
    passwordHash: { from: '[hidden]', to: '[hidden]' },
  });
  // Nothing of note changed: timestamps alone are not a change.
  assert.equal(diffRecords(before, { ...before, updatedAt: new Date() }), null);
  // A field that appeared or went away counts.
  assert.deepEqual(diffRecords({ a: 1 }, {}), { a: { from: 1, to: null } });
});

test('a record is named in the log by what it is about', () => {
  assert.equal(labelOf('User', { name: 'Lena Fischer', username: 'lena' }), 'Lena Fischer (@lena)');
  assert.equal(labelOf('Outcome', { reason: 'Travel', amount: 295 }), 'Travel · 295');
  assert.equal(labelOf('Plan', { type: 'weekly', period: '2026-W43' }), 'weekly plan 2026-W43');
  assert.equal(labelOf('Task', { name: 'Supplier review' }), 'Supplier review');
  assert.equal(labelOf('Message', { content: 'x'.repeat(300) }).length, 200);
  assert.equal(labelOf('Whatever', {}), '');
});

test('every uploaded file a deleted record pointed to is found', () => {
  const snapshot = {
    images: [{ file: '1700000000000-0123456789ab.png' }, { file: '1700000000001-0123456789ab.jpg' }],
    photo: { file: '1700000000002-0123456789ab.webp' },
    note: 'file: not-a-file.png',
    nested: { deep: [{ screenshot: { file: '1700000000000-0123456789ab.png' } }] },
  };
  assert.deepEqual(filesOf(snapshot), ['1700000000000-0123456789ab.png', '1700000000001-0123456789ab.jpg', '1700000000002-0123456789ab.webp']);
});
