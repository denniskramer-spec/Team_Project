import test from 'node:test';
import assert from 'node:assert/strict';
import { achievedFor, planStatus, targetsReached } from '../src/utils/planStatus.js';

const week = { scope: 'personal', owner: 'u1', periodStart: '2026-10-19T00:00:00Z', periodEnd: '2026-10-26T00:00:00Z', jobBid: 10, income: 500 };
const during = new Date('2026-10-22T12:00:00Z');
const after = new Date('2026-10-27T12:00:00Z');
const short = { jobBid: 4, income: 100 };
const met = { jobBid: 12, income: 500 };

test('while the period runs, the status is the one the owner picked', () => {
  assert.equal(planStatus({ ...week, status: 'progress' }, short, during), 'progress');
  assert.equal(planStatus({ ...week, status: 'not_done' }, met, during), 'not_done');
});

test('once the period is over, an unfinished plan is not done', () => {
  assert.equal(planStatus({ ...week, status: 'progress' }, short, after), 'not_done');
  assert.equal(planStatus({ ...week, status: 'not_done' }, short, after), 'not_done');
});

test('once over, a plan marked done or with every target reached is done', () => {
  assert.equal(planStatus({ ...week, status: 'done' }, short, after), 'done');
  assert.equal(planStatus({ ...week, status: 'progress' }, met, after), 'done');
});

test('a plan that set no target has nothing reached', () => {
  assert.equal(targetsReached({ ...week, jobBid: 0, income: 0 }, met), false);
});

test('achieved counts only the owner\'s records inside the plan\'s own period', () => {
  const reports = [
    { author: 'u1', periodStart: '2026-10-20T00:00:00Z', jobBid: 3 },
    { author: 'u1', periodStart: '2026-10-25T00:00:00Z', bid: 2 }, // older reports: one bid count
    { author: 'u1', periodStart: '2026-10-26T00:00:00Z', jobBid: 50 }, // the next week
    { author: 'u2', periodStart: '2026-10-21T00:00:00Z', jobBid: 50 },
  ];
  const incomes = [{ member: 'u1', date: '2026-10-21T00:00:00Z', amount: 120.5 }, { member: 'u2', date: '2026-10-21T00:00:00Z', amount: 999 }];
  const a = achievedFor(week, reports, incomes);
  assert.equal(a.jobBid, 5);
  assert.equal(a.income, 120.5);
});
