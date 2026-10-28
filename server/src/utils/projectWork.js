import Report from '../models/Report.js';
import Income from '../models/Income.js';
import { periodKey } from './period.js';

// What the daily reports say about each project, for the Projects list: the
// days with work on it, the hours, whether today's report has some, what the
// unpaid days still expect, and what income records on it have paid. Counted
// in the database rather than by loading every report: the list is asked for
// on every change, and the reports only ever grow.

const money = (n) => Math.round(n * 100) / 100;
const empty = () => ({ days: 0, today: false, upcoming: 0, paid: 0, hours: 0 });

// { [taskId]: summary } from the work rows ({ _id: { task, author }, days,
// hours, upcoming, todays }) and the paid rows ({ _id: task, amount }).
// `owners` maps each task id to its owner's id: only the owner's own reports
// count (a project moved between people keeps its log from the current owner).
export function summaryFromRows(workRows, paidRows, owners) {
  const out = {};
  for (const r of workRows) {
    const id = String(r._id.task);
    if (owners.get(id) !== String(r._id.author)) continue;
    out[id] ??= empty();
    out[id].days += r.days;
    out[id].hours += r.hours;
    out[id].upcoming = money(out[id].upcoming + r.upcoming);
    if (r.todays > 0) out[id].today = true;
  }
  for (const p of paidRows) {
    const id = String(p._id);
    out[id] ??= empty();
    out[id].paid = money(p.amount);
  }
  return out;
}

// A work entry counts when something was written, or hours or tasks reported.
const HAS_WORK = {
  $or: [
    { $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ['$work.text', ''] } } } }, 0] },
    { $gt: [{ $ifNull: ['$work.hours', 0] }, 0] },
    { $gt: [{ $ifNull: ['$work.count', 0] }, 0] },
  ],
};

export async function workSummary(tasks) {
  if (!tasks.length) return {};
  const ids = tasks.map((t) => t._id);
  const owners = new Map(tasks.map((t) => [String(t._id), String(t.owner?._id ?? t.owner)]));
  const today = periodKey('daily');
  const [workRows, paidRows] = await Promise.all([
    Report.aggregate([
      { $match: { scope: 'personal', type: 'daily', 'work.task': { $in: ids } } },
      { $unwind: '$work' },
      { $match: { 'work.task': { $in: ids }, $expr: HAS_WORK } },
      {
        $group: {
          _id: { task: '$work.task', author: '$author' },
          days: { $sum: 1 },
          hours: { $sum: { $ifNull: ['$work.hours', 0] } },
          upcoming: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$work.paidBy', null] }, null] }, { $ifNull: ['$work.amount', 0] }, 0] } },
          todays: { $sum: { $cond: [{ $eq: ['$period', today] }, 1, 0] } },
        },
      },
    ]),
    Income.aggregate([{ $match: { task: { $in: ids } } }, { $group: { _id: '$task', amount: { $sum: '$amount' } } }]),
  ]);
  return summaryFromRows(workRows, paidRows, owners);
}
