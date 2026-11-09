import Report from '../models/Report.js';
import Task from '../models/Task.js';
import { workEarnings } from './payments.js';
import { VARIANCE_LIMIT } from './incomeVariance.js';
import { reportChanged } from '../socket/events.js';

// The money side of a daily report's work entries, shared by the Dashboard,
// Projects, Finance and Checkout so they all read the same numbers:
//   earned   what the reported hours and tasks are worth, paid or not
//   upcoming the part no income record has paid yet (the report's upcoming amount)

const money = (n) => Math.round(n * 100) / 100;

export const earnedOf = (work = []) => money(work.reduce((n, w) => n + (w.amount || 0), 0));
export const upcomingOf = (work = []) => money(work.filter((w) => !w.paidBy).reduce((n, w) => n + (w.amount || 0), 0));

// Sets the report's upcoming amount and date from its work entries.
export function applyUpcoming(report) {
  report.upcomingAmount = upcomingOf(report.work);
  report.upcomingDate = report.upcomingAmount > 0 ? report.periodStart : null;
  return report;
}

// Saves a report whose work changed and tells every screen that shows it.
async function saveAndTell(report) {
  applyUpcoming(report);
  await report.save();
  reportChanged({ _id: report.author }, report);
}

// A project's price, unit or resident share changed: the unpaid work on it
// is worth something else now, so the owner's reports are re-priced. Paid
// days keep the amount they were paid for.
export async function repriceTask(taskId) {
  const t = await Task.findById(taskId, 'price priceUnit currency resident').populate('resident', 'sharePercent').lean();
  if (!t) return 0;
  const reports = await Report.find({ scope: 'personal', type: 'daily', work: { $elemMatch: { task: t._id, paidBy: null } } });
  let changed = 0;
  for (const r of reports) {
    let touched = false;
    for (const w of r.work) {
      if (String(w.task) !== String(t._id) || w.paidBy) continue;
      const amount = workEarnings({ price: t.price, priceUnit: t.priceUnit, currency: t.currency, residentPercent: t.resident?.sharePercent ?? 0 }, { hours: w.hours, count: w.count });
      if (amount !== (w.amount ?? 0)) { w.amount = amount; touched = true; }
    }
    if (!touched) continue;
    await saveAndTell(r);
    changed += 1;
  }
  return changed;
}

// A resident's share changed: every project for them is re-priced.
export async function repriceResident(residentId) {
  const tasks = await Task.find({ resident: residentId }, '_id').lean();
  let changed = 0;
  for (const t of tasks) changed += await repriceTask(t._id);
  return changed;
}

// A project was removed: its work leaves the reports and their upcoming
// amounts follow.
export async function dropTaskWork(taskId) {
  const reports = await Report.find({ 'work.task': taskId });
  for (const r of reports) {
    r.work = r.work.filter((w) => String(w.task) !== String(taskId));
    await saveAndTell(r);
  }
  return reports.length;
}

// Which of the unpaid entries (oldest first, each { amount }) an income
// whose member's share is `share` pays for: all of them when the share
// covers their total within the variance limit (a correct payment, or near
// enough), otherwise the oldest ones as far as the share reaches. An
// instalment settles what it paid for and leaves the rest upcoming; no
// share given (an older caller) settles everything.
export function paidEntries(entries, share) {
  if (share === undefined || share === null) return entries.length;
  const total = money(entries.reduce((n, e) => n + (e.amount || 0), 0));
  if (share >= money(total * (1 - VARIANCE_LIMIT / 100))) return entries.length;
  let paid = 0;
  let count = 0;
  for (const e of entries) {
    if (money(paid + (e.amount || 0)) > share + 0.005) break;
    paid = money(paid + (e.amount || 0));
    count += 1;
  }
  return count;
}

// The member's share of an income record (after the resident's part), the
// same footing the reported work is priced on (utils/incomeVariance.js).
export const shareOf = (income) => money((Number(income.amount) || 0) * (1 - (Number(income.residentPercent) || 0) / 100));

// An income record on a project pays for the unpaid work reported on it:
// those days stop counting as upcoming, oldest first, as far as the
// income's share reaches (paidEntries). Returns how many days were settled.
export async function settleTaskWork(taskId, memberId, incomeId, share) {
  const reports = await Report.find({ author: memberId, scope: 'personal', type: 'daily', work: { $elemMatch: { task: taskId, paidBy: null } } }).sort({ periodStart: 1 });
  const unpaid = reports.flatMap((r) => r.work.filter((w) => String(w.task) === String(taskId) && !w.paidBy).map((w) => ({ report: r, w })));
  const count = paidEntries(unpaid.map(({ w }) => ({ amount: w.amount })), share);
  const touched = new Set();
  unpaid.slice(0, count).forEach(({ report, w }) => { w.paidBy = incomeId; touched.add(report); });
  for (const r of touched) await saveAndTell(r);
  return count;
}

// What all of a member's reported work still expects to be paid, over
// every project: { amount, days, projects }.
export async function unpaidWorkOf(memberId) {
  const reports = await Report.find({ author: memberId, scope: 'personal', type: 'daily', work: { $elemMatch: { paidBy: null, amount: { $gt: 0 } } } }, 'work').lean();
  const entries = reports.flatMap((r) => (r.work ?? []).filter((w) => !w.paidBy && w.amount > 0));
  return { amount: money(entries.reduce((n, w) => n + w.amount, 0)), days: entries.length, projects: new Set(entries.map((w) => String(w.task))).size };
}
