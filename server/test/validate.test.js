import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDay, checkText, checkAmount, parseBirthday } from '../src/utils/validate.js';
import { ownsRecords } from '../src/utils/recordOwner.js';

const iso = (d) => d.toISOString();

test('calendar days must exist', () => {
  assert.equal(iso(checkDay('2026-09-28', 'a date')), '2026-09-28T00:00:00.000Z');
  assert.equal(iso(checkDay('2024-02-29', 'a date')), '2024-02-29T00:00:00.000Z'); // leap year
  assert.equal(iso(checkDay('2026-09-28T10:00:00.000Z', 'a date')), '2026-09-28T10:00:00.000Z');
  for (const bad of ['2026-02-31', '2025-02-29', '2026-04-31', '2026-13-01', '2026-9-1', 'garbage', 'Sep 28 2026', '2026-02-31T10:00:00Z']) {
    assert.throws(() => checkDay(bad, 'a date'), { status: 400 }, bad);
  }
});

test('days need a value, and a sensible year', () => {
  for (const bad of [undefined, null, '', '  ', 5, {}, [], true]) assert.throws(() => checkDay(bad, 'a date'), { status: 400 });
  assert.throws(() => checkDay('1999-12-31', 'a date'), { status: 400 });
  assert.throws(() => checkDay('9999-12-31', 'a date'), { status: 400 });
});

test('text is text', () => {
  assert.equal(checkText(' hi ', 'Reason', 10), 'hi');
  assert.equal(checkText(5, 'Reason', 10), '5');
  assert.equal(checkText(undefined, 'Note', 10), '');
  for (const bad of [{ a: 1 }, ['a'], true]) assert.throws(() => checkText(bad, 'Reason', 10), { status: 400 });
  assert.throws(() => checkText('x'.repeat(11), 'Reason', 10), { status: 400 });
  assert.throws(() => checkText('  ', 'Reason', 10, { required: true }), { status: 400 });
});

test('amounts are numbers, rounded to cents', () => {
  assert.equal(checkAmount('12.345'), 12.35);
  assert.equal(checkAmount(0), 0);
  for (const bad of [null, undefined, '', ' ', 'abc', -1, true, [], [5], {}, Infinity, 2e12]) {
    assert.throws(() => checkAmount(bad), { status: 400 }, String(bad));
  }
});

test('birthdays are real days in the past', () => {
  assert.equal(parseBirthday(''), null);
  assert.equal(iso(parseBirthday('1990-07-02')), '1990-07-02T00:00:00.000Z');
  assert.equal(iso(parseBirthday('1990-07-02T00:00:00.000Z')), '1990-07-02T00:00:00.000Z');
  for (const bad of ['1990-02-31', '2999-01-01', '1800-01-01', 'garbage', 5, {}]) assert.throws(() => parseBirthday(bad), { status: 400 }, String(bad));
});

test('only members and bosses own records', () => {
  assert.ok(ownsRecords({ role: 'member' }));
  assert.ok(ownsRecords({ role: 'boss' }));
  assert.ok(!ownsRecords({ role: 'leader' }));
  assert.ok(!ownsRecords({ role: 'admin' }));
});
