import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyBase, carryOver, daysBetween, goalsOf, GOAL_ITEMS } from '../src/utils/dailyGoal.js';

test('a plan target is shared out per day, rounded up', () => {
  assert.equal(dailyBase('jobBid', 750, 7), 108);
  assert.equal(dailyBase('jobBid', 1050, 7), 150);
  assert.equal(dailyBase('biddingHours', 20, 7), 3);     // 2.86 → 3.0
  assert.equal(dailyBase('biddingHours', 15, 7), 2.5);   // 2.14 → 2.5
  assert.equal(dailyBase('jobBid', 0, 7), 0);
  assert.equal(dailyBase('jobBid', 10, 0), 0);
});

test('what a day falls short by moves to the next day', () => {
  assert.equal(carryOver(150, []), 0);
  assert.equal(carryOver(150, [115]), 35);
  assert.equal(carryOver(150, [115, 150]), 35);          // still owed
  assert.equal(carryOver(150, [115, 185]), 0);           // paid back
  assert.equal(carryOver(150, [115, 0]), 185);           // a day without a report
  assert.equal(carryOver(150, [200, 100]), 50);          // extra work is no credit for later
  assert.equal(carryOver(150, [200]), 0);
});

test('the days before today in a period', () => {
  const start = new Date('2026-10-26T00:00:00Z');
  assert.deepEqual(daysBetween(start, new Date('2026-10-28T00:00:00Z')), ['2026-10-26', '2026-10-27']);
  assert.deepEqual(daysBetween(start, start), []);
});

test("today's goals come from the plan and the reports so far", () => {
  const plan = { type: 'weekly', period: '2026-W44', periodStart: new Date('2026-10-26T00:00:00Z'), periodEnd: new Date('2026-11-02T00:00:00Z'), jobBid: 1050, aiBid: 0, resumes: 14 };
  const reports = [{ period: '2026-10-26', jobBid: 115, resumes: 2 }];
  const g = goalsOf(plan, new Date('2026-10-27T00:00:00Z'), reports);
  assert.equal(g.plan.period, '2026-W44');
  assert.deepEqual(g.items.jobBid, { base: 150, carry: 35, goal: 185, target: 1050, days: 7 });
  assert.deepEqual(g.items.resumes, { base: 2, carry: 0, goal: 2, target: 14, days: 7 });
  assert.equal(g.items.aiBid, undefined);                 // nothing planned, no goal
  assert.equal(goalsOf(null, new Date(), []), null);
  assert.equal(goalsOf({ ...plan, jobBid: 0, resumes: 0 }, new Date('2026-10-27T00:00:00Z'), []), null);
  // Older plans counted bids in one field.
  assert.equal(goalsOf({ ...plan, jobBid: 0, bid: 700 }, plan.periodStart, []).items.jobBid.base, 100);
  assert.deepEqual(GOAL_ITEMS, ['jobBid', 'aiBid', 'resumes', 'forms']); // time bidding is not a plan target
});
