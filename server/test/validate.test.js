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

test('control characters are dropped, line breaks kept', async () => {
  const { clean, checkOptionalAmount } = await import('../src/utils/validate.js');
  assert.equal(clean('a\u0000b\u001bc'), 'abc');
  assert.equal(clean('line 1\nline 2\tend'), 'line 1\nline 2\tend');
  assert.equal(checkText('\u0000', 'Name', 10), '');
  assert.equal(checkOptionalAmount('', 'Salary'), 0);
  assert.equal(checkOptionalAmount(undefined, 'Salary'), 0);
  assert.equal(checkOptionalAmount('7.5', 'Salary'), 7.5);
  for (const bad of [{ toString: 'x' }, {}, [], true, 'abc', -2]) assert.throws(() => checkOptionalAmount(bad, 'Salary'), { status: 400 });
});

test('a password has to be text of the right length with a digit', async () => {
  const { checkPassword } = await import('../src/utils/validate.js');
  assert.equal(checkPassword('lantern-Fjord42'), 'lantern-Fjord42');
  for (const bad of [12345678, null, undefined, { length: 10 }, 'short1', 'noDigitsHere', 'a1'.repeat(70)]) {
    assert.throws(() => checkPassword(bad), { status: 400 }, String(bad));
  }
});

test('a common or leaked password is refused, whatever its case', async () => {
  const { checkPassword } = await import('../src/utils/validate.js');
  for (const bad of ['password1', 'Password1', 'qwerty123', 'demo1234', 'ADMIN1234']) {
    assert.throws(() => checkPassword(bad), /most common/, bad);
  }
});

test('a password may not contain the username', async () => {
  const { checkPassword } = await import('../src/utils/validate.js');
  assert.throws(() => checkPassword('xBrunoTheBest77', 'bruno'), /username/);
  assert.equal(checkPassword('lantern-Fjord42', 'bruno'), 'lantern-Fjord42');
});

test('counts are whole numbers and lists have a size limit', async () => {
  const { checkCount, checkList, checkDay } = await import('../src/utils/validate.js');
  assert.equal(checkCount('', 'Bids'), 0);
  assert.equal(checkCount('12', 'Bids'), 12);
  assert.equal(checkCount(3, 'Bids'), 3);
  for (const bad of [2.5, '1.5', -1, 'abc', {}, [], true]) assert.throws(() => checkCount(bad, 'Bids'), { status: 400 }, String(bad));
  assert.throws(() => checkCount(10, 'Bids', 5), { status: 400 });
  assert.deepEqual(checkList([1, 2], 'Calls', 2), [1, 2]);
  assert.throws(() => checkList([1, 2, 3], 'Calls', 2), { status: 400 });
  assert.throws(() => checkList('x', 'Calls', 2), { status: 400 });
  // A joined date or first contact cannot be in the future.
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  assert.throws(() => checkDay(tomorrow, 'the joined date', { pastOnly: true }), { status: 400 });
  assert.ok(checkDay(tomorrow, 'a start date') instanceof Date);
});
