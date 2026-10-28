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

// The form's work entries, carrying the paid marks of the stored ones.
export function keepPaid(stored = [], work = []) {
  const paid = new Map(stored.filter((w) => w.paidBy).map((w) => [String(w.task), w.paidBy]));
  return work.map((w) => ({ ...w, paidBy: paid.get(String(w.task)) ?? null }));
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
