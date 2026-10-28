import test from 'node:test';
import assert from 'node:assert/strict';
import { VARIANCE_LIMIT, canCheckVariance, grossFor, varianceOf } from '../src/utils/incomeVariance.js';

test('within 5% of what the work expected needs no reason', () => {
  assert.equal(VARIANCE_LIMIT, 5);
  assert.deepEqual(varianceOf(1000, 0, 1000), { share: 1000, percent: 0, outside: false });
  assert.equal(varianceOf(1050, 0, 1000).outside, false); // exactly 5%
  assert.equal(varianceOf(950, 0, 1000).outside, false);
});

test('further off than 5%, either way, needs a reason', () => {
  assert.deepEqual(varianceOf(1060, 0, 1000), { share: 1060, percent: 6, outside: true });
  assert.deepEqual(varianceOf(800, 0, 1000), { share: 800, percent: -20, outside: true });
});

test('the resident\'s share is taken off before comparing, like the reports do', () => {
  // Reports expect 800 (1000 of work, 20% to the resident); 1000 received is right on.
  assert.equal(varianceOf(1000, 20, 800).percent, 0);
  assert.equal(varianceOf(800, 20, 800).outside, true); // the resident's share was forgotten
  assert.equal(grossFor(800, 20), 1000);
  assert.equal(grossFor(500, 0), 500);
});

test('no expected amount means nothing to compare', () => {
  assert.deepEqual(varianceOf(500, 0, 0), { share: 500, percent: null, outside: false });
});

test('the team leader and bosses check it off', () => {
  assert.ok(canCheckVariance({ role: 'leader' }) && canCheckVariance({ role: 'boss' }));
  assert.ok(!canCheckVariance({ role: 'member' }) && !canCheckVariance({ role: 'admin' }));
});
