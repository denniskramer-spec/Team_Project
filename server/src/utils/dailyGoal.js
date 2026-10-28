// Daily goals for the bid report, worked out from the member's plan.
//
// A weekly plan says "750 applied this week"; the daily goal is its share
// per day (750 / 7 = 108, rounded up so hitting every daily goal hits the
// plan). What a day falls short by is added to the next day's goal, so a
// goal of 150 with 115 done makes tomorrow's goal 185. A day without a
// report counts as 0 done. Doing more than the goal pays the shortfall
// back, but never turns into a credit. The carry starts at 0 on the first
// day of the plan's period; a monthly plan is used when the member has no
// weekly one for the day.

import { PLAN_ITEMS } from '../models/Plan.js';

export const GOAL_ITEMS = PLAN_ITEMS.filter((i) => i.group === 'Bids').map((i) => i.key);
const HOURS = new Set(['biddingHours']);

const DAY_MS = 24 * 3600 * 1000;

// Rounded up: counts to a whole number, hours to a half hour.
export const roundGoal = (key, value) => (HOURS.has(key) ? Math.ceil(value * 2) / 2 : Math.ceil(value));

// The per-day share of a plan target over `days` days.
export function dailyBase(key, target, days) {
  if (!(target > 0) || !(days > 0)) return 0;
  return roundGoal(key, target / days);
}

// What the days before today leave to catch up on: each day adds its goal
// and takes off what was done, never going below 0.
export function carryOver(base, doneBefore) {
  let carry = 0;
  for (const done of doneBefore) carry = Math.max(0, carry + base - (Number(done) || 0));
  return Math.round(carry * 100) / 100;
}

// The calendar days from `start` up to (not including) `day`, as period keys.
export function daysBetween(start, day) {
  const keys = [];
  for (let t = start.getTime(); t < day.getTime(); t += DAY_MS) keys.push(new Date(t).toISOString().slice(0, 10));
  return keys;
}

// Today's goals from a plan and the reports of the period so far.
//   plan:    { jobBid, aiBid, ..., bid, periodStart, periodEnd }
//   day:     the report's day (UTC midnight)
//   reports: the member's daily reports of the period before `day`
export function goalsOf(plan, day, reports) {
  if (!plan) return null;
  const days = Math.round((plan.periodEnd - plan.periodStart) / DAY_MS);
  const byDay = new Map(reports.map((r) => [r.period, r]));
  const before = daysBetween(plan.periodStart, day);
  const items = {};
  for (const key of GOAL_ITEMS) {
    const target = key === 'jobBid' ? (plan.jobBid || plan.bid || 0) : (plan[key] || 0);
    const base = dailyBase(key, target, days);
    if (!base) continue;
    const done = before.map((d) => { const r = byDay.get(d); return r ? (key === 'jobBid' ? (r.jobBid || r.bid || 0) : (r[key] || 0)) : 0; });
    const carry = carryOver(base, done);
    items[key] = { base, carry, goal: Math.round((base + carry) * 100) / 100, target, days };
  }
  if (!Object.keys(items).length) return null;
  return { plan: { type: plan.type, period: plan.period }, items };
}
