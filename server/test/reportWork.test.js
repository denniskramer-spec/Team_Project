import test from 'node:test';
import assert from 'node:assert/strict';
import { earnedOf, upcomingOf, applyUpcoming } from '../src/utils/reportWork.js';

const work = [
  { task: 'a', hours: 5, amount: 325, paidBy: null },
  { task: 'b', hours: 2, amount: 50.005, paidBy: 'income1' },
  { task: 'c', count: 3, amount: 30, paidBy: null },
];

test('earned counts every day, upcoming only the unpaid ones', () => {
  assert.equal(earnedOf(work), 405.01);
  assert.equal(upcomingOf(work), 355);
  assert.equal(earnedOf([]), 0);
  assert.equal(upcomingOf(undefined), 0);
});

test('a report with nothing unpaid loses its upcoming date', () => {
  const start = new Date('2026-10-26T00:00:00.000Z');
  const paid = applyUpcoming({ periodStart: start, work: work.filter((w) => w.paidBy) });
  assert.equal(paid.upcomingAmount, 0);
  assert.equal(paid.upcomingDate, null);
  const open = applyUpcoming({ periodStart: start, work });
  assert.equal(open.upcomingAmount, 355);
  assert.equal(open.upcomingDate, start);
});
