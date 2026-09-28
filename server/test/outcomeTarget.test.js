import test from 'node:test';
import assert from 'node:assert/strict';
import { shares, checkMoneyFields, inScope } from '../src/utils/outcomeTarget.js';

test('shares always add up to the total, in cents', () => {
  for (const [total, count] of [[100, 3], [0.05, 4], [1234.56, 7], [0, 2], [10, 1]]) {
    const parts = shares(total, count);
    assert.equal(parts.length, count);
    assert.equal(Math.round(parts.reduce((a, b) => a + b, 0) * 100), Math.round(total * 100));
    assert.ok(Math.max(...parts) - Math.min(...parts) <= 0.01 + 1e-9);
  }
  assert.deepEqual(shares(100, 3), [33.34, 33.33, 33.33]);
});

test('money fields', () => {
  assert.deepEqual(checkMoneyFields({ amount: '12.345', reason: ' Taxi ' }), { amount: 12.35, reason: 'Taxi' });
  assert.throws(() => checkMoneyFields({ amount: -1, reason: 'x' }), { status: 400 });
  assert.throws(() => checkMoneyFields({ amount: 5, reason: '  ' }), { status: 400 });
  assert.deepEqual(checkMoneyFields({ comment: 'ok' }, true), { comment: 'ok' });
});

test('who sees an outcome record', () => {
  const A = 'a'.repeat(24);
  const record = { member: 'memA', group: A };
  assert.ok(inScope({ _id: 'x', role: 'admin' }, record));
  assert.ok(inScope({ _id: 'b', role: 'boss', group: A }, record));
  assert.ok(!inScope({ _id: 'b', role: 'boss', group: 'b'.repeat(24) }, record));
  assert.ok(inScope({ _id: 'memA', role: 'member', group: A }, record));
  assert.ok(!inScope({ _id: 'memA2', role: 'member', group: A }, record));
});
