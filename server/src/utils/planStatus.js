import { PLAN_ITEMS } from '../models/Plan.js';

// A plan's targets; older plans counted bids in one field, shown as job bids.
export const targetsOf = (p) => Object.fromEntries(PLAN_ITEMS.map((i) => [i.key, i.key === 'jobBid' ? (p.jobBid || p.bid || 0) : (p[i.key] || 0)]));

// Whether every target the plan set (above 0) was reached; a plan that set
// none has nothing to reach.
export function targetsReached(plan, achieved) {
  const targets = targetsOf(plan);
  const set = PLAN_ITEMS.filter((i) => targets[i.key] > 0);
  return set.length > 0 && set.every((i) => (achieved?.[i.key] ?? 0) >= targets[i.key]);
}

// The status a plan shows. While its period runs it is the one its owner
// picked. Once the period is over it is settled: Done if the owner marked it
// done or every target was reached, Not done otherwise ("In progress" makes
// no sense for a week that has passed).
//   now  the team's wall clock (teamNow)
export function planStatus(plan, achieved, now) {
  if (new Date(plan.periodEnd) > now) return plan.status;
  if (plan.status === 'done' || targetsReached(plan, achieved)) return 'done';
  return 'not_done';
}

// What the daily reports and income records in the plan's own period add up
// to for its owner (personal plan) or group (group plan).
//   reports  personal daily reports (jobBid/bid and the other target fields, author, group, periodStart)
//   incomes  income records (member, group, date, amount)
export function achievedFor(plan, reports, incomes) {
  const start = new Date(plan.periodStart).getTime();
  const end = new Date(plan.periodEnd).getTime();
  const inside = (d) => { const t = new Date(d).getTime(); return t >= start && t < end; };
  const id = (v) => String(v?._id ?? v);
  const who = plan.scope === 'group' ? id(plan.group) : id(plan.owner);
  const mine = (doc, field) => (plan.scope === 'group' ? id(doc.group) : id(doc[field])) === who;
  const acc = Object.fromEntries(PLAN_ITEMS.map((i) => [i.key, 0]));
  for (const r of reports) {
    if (!inside(r.periodStart) || !mine(r, 'author')) continue;
    for (const i of PLAN_ITEMS) if (i.key !== 'income') acc[i.key] += i.key === 'jobBid' ? (r.jobBid || r.bid || 0) : (r[i.key] || 0);
  }
  for (const inc of incomes) if (inside(inc.date) && mine(inc, 'member')) acc.income += inc.amount || 0;
  acc.income = Math.round(acc.income * 100) / 100;
  return acc;
}
