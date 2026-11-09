import test from 'node:test';
import assert from 'node:assert/strict';
import { earnedOf, upcomingOf, applyUpcoming, paidEntries, shareOf } from '../src/utils/reportWork.js';

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

test('an income settles the oldest days its share reaches, or all of them when it covers them', () => {
  const days = [{ amount: 400 }, { amount: 400 }, { amount: 400 }, { amount: 400 }, { amount: 400 }];
  assert.equal(paidEntries(days, 2000), 5);
  assert.equal(paidEntries(days, 1950), 5); // within the variance limit: a correct payment
  assert.equal(paidEntries(days, 2300), 5); // more than expected settles everything
  assert.equal(paidEntries(days, 500), 1); // an instalment: one day paid, four stay upcoming
  assert.equal(paidEntries(days, 1200), 3);
  assert.equal(paidEntries(days, 399.99), 0);
  assert.equal(paidEntries(days, undefined), 5); // no share known: as before
  assert.equal(paidEntries([], 100), 0);
  // The member's share is what is compared, after the resident's part.
  assert.equal(shareOf({ amount: 1000, residentPercent: 30 }), 700);
  assert.equal(shareOf({ amount: 1000 }), 1000);
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
