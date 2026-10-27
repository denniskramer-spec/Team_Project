import Report from '../models/Report.js';
import Task from '../models/Task.js';
import { workEarnings } from './payments.js';
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
  const t = await Task.findById(taskId, 'price priceUnit resident').populate('resident', 'sharePercent').lean();
  if (!t) return 0;
  const reports = await Report.find({ scope: 'personal', type: 'daily', work: { $elemMatch: { task: t._id, paidBy: null } } });
  let changed = 0;
  for (const r of reports) {
    let touched = false;
    for (const w of r.work) {
      if (String(w.task) !== String(t._id) || w.paidBy) continue;
      const amount = workEarnings({ price: t.price, priceUnit: t.priceUnit, residentPercent: t.resident?.sharePercent ?? 0 }, { hours: w.hours, count: w.count });
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

// An income record on a project pays for the unpaid work reported on it:
// those days stop counting as upcoming. Returns how many days were settled.
export async function settleTaskWork(taskId, memberId, incomeId) {
  const reports = await Report.find({ author: memberId, scope: 'personal', type: 'daily', work: { $elemMatch: { task: taskId, paidBy: null } } });
  let settled = 0;
  for (const r of reports) {
    r.work.forEach((w) => { if (String(w.task) === String(taskId) && !w.paidBy) { w.paidBy = incomeId; settled += 1; } });
    await saveAndTell(r);
  }
  return settled;
}
