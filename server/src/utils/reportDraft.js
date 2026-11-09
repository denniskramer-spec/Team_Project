import Report from '../models/Report.js';
import { upcomingOf } from './reportWork.js';
import { conflict } from './httpError.js';

// Saving a daily report (an autosave, a send) must never undo what Finance
// did to it meanwhile: an income record marks the day's work on a project as
// paid (reportWork.js, settleTaskWork), and that mark lives inside the report.
// So the work sent with the form is merged with the paid marks of the copy on
// disk, and the write only lands if that copy is still the one that was read
// (its updatedAt is the version). A copy changed in between is read and
// merged again, once; after that the caller is told to save again.

// The form's work entries, with the paid ones as they were paid for. A day's
// work an income has settled is history: its hours, tasks and amount stay
// as stored (only the words about it may change), and leaving it out of the
// form does not make it unpaid again.
export function keepPaid(stored = [], work = []) {
  const paid = new Map(stored.filter((w) => w.paidBy).map((w) => [String(w.task), w]));
  const sent = new Set(work.map((w) => String(w.task)));
  const merged = work.map((w) => {
    const p = paid.get(String(w.task));
    return p ? { ...p, text: w.text ?? p.text } : { ...w, paidBy: null };
  });
  for (const [task, p] of paid) if (!sent.has(task)) merged.push({ ...p });
  return merged;
}

// The filter and options for writing over `existing` (null: nothing stored
// yet, so the report is inserted). The filter names the version read.
export function versionedWrite(key, existing) {
  if (!existing) return { filter: key, options: { new: true, upsert: true, setDefaultsOnInsert: true } };
  return { filter: { ...key, updatedAt: existing.updatedAt }, options: { new: true } };
}

// The work entries and the upcoming amount and date that follow from them:
// the unpaid ones add up, due on the report day.
export function upcomingFields(work, periodStart) {
  const upcoming = upcomingOf(work);
  return { work, upcomingAmount: upcoming, upcomingDate: upcoming > 0 ? periodStart : null };
}

// Creates or updates the report `key` names ({ author, type, period, scope }).
// `fields` are the checked form fields (with periodStart); `work`, when
// given, is the day's work. Returns the saved report.
export async function saveReport(key, fields, work, { attempts = 2 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    const existing = await Report.findOne(key, 'work updatedAt').lean();
    const update = { ...fields, ...(work === undefined ? {} : upcomingFields(keepPaid(existing?.work, work), fields.periodStart)) };
    const { filter, options } = versionedWrite(key, existing);
    const report = await Report.findOneAndUpdate(filter, update, options);
    if (report) return report;
    if (attempt >= attempts) throw conflict('This report was changed a moment ago, please save again');
  }
}
