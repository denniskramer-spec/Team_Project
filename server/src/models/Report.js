import mongoose from 'mongoose';
import { PERIOD_TYPES } from '../utils/period.js';

// What was done on one project that day (and for how long); shown in the
// project's work log.
const workSchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    text: { type: String, default: '', trim: true, maxlength: 2000 },
    hours: { type: Number, default: 0, min: 0, max: 24 },
    // Tasks done that day, on a per-task project.
    count: { type: Number, default: 0, min: 0 },
    // What those hours earn the member on an hourly project, after the
    // resident's share; it adds up to the report's upcoming amount.
    amount: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

// One line of the day's plan, ticked off as it gets done.
const planItemSchema = new mongoose.Schema(
  { text: { type: String, required: true, trim: true, maxlength: 300 }, done: { type: Boolean, default: false } },
  { _id: false },
);

export const CALL_RESULTS = ['well', 'mixed', 'bad'];

// One call that day: when, with whom, how it went.
const callSchema = new mongoose.Schema(
  {
    time: { type: String, default: '', trim: true, maxlength: 10 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    profile: { type: String, default: '', trim: true, maxlength: 120 },
    caller: { type: String, default: '', trim: true, maxlength: 120 },
    result: { type: String, enum: [...CALL_RESULTS, ''], default: '' },
    note: { type: String, default: '', trim: true, maxlength: 2000 },
  },
  { _id: false },
);

// One report per author, per period, per scope.
// scope 'personal' = a member's own report; 'group' = a boss's report for their group.
const reportSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    scope: { type: String, enum: ['personal', 'group'], default: 'personal' },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    type: { type: String, enum: PERIOD_TYPES, required: true },
    period: { type: String, required: true },   // e.g. 2026-09-22, 2026-W39, 2026-09, 2026
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    // The report form: job bids, AI training bids, income, what is coming next
    // (amount + note) and a note.
    jobBid: { type: Number, default: 0, min: 0 },
    aiBid: { type: Number, default: 0, min: 0 },
    income: { type: Number, default: 0, min: 0 },
    upcomingAmount: { type: Number, default: 0, min: 0 },
    upcomingNote: { type: String, default: '', trim: true, maxlength: 2000 },
    // When the upcoming income is expected (a calendar day at UTC midnight).
    upcomingDate: { type: Date, default: null },
    // The task this day's work (and its income) belongs to, so Finance can
    // show what was done to earn it.
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    // One entry per project worked on that day (the daily report has a box
    // for each active project).
    work: { type: [workSchema], default: [] },
    // The day's plan (carried over from the previous report's "plan for
    // tomorrow") and what is planned next, one line each.
    todayPlan: { type: [planItemSchema], default: [] },
    planTomorrow: { type: String, default: '', trim: true, maxlength: 2000 },
    calls: { type: [callSchema], default: [] },
    // Bid report, next to the job and AI training bid counts above.
    resumes: { type: Number, default: 0, min: 0 },
    forms: { type: Number, default: 0, min: 0 },
    biddingHours: { type: Number, default: 0, min: 0, max: 24 },
    bidNote: { type: String, default: '', trim: true, maxlength: 2000 },
    // Candidate contact report.
    contacted: { type: Number, default: 0, min: 0 },
    replies: { type: Number, default: 0, min: 0 },
    agreed: { type: Number, default: 0, min: 0 },
    channels: { type: String, default: '', trim: true, maxlength: 300 },
    contactNote: { type: String, default: '', trim: true, maxlength: 2000 },
    // Free text: residents update (#Name tags), issues / blockers.
    residentsUpdate: { type: String, default: '', trim: true, maxlength: 2000 },
    issues: { type: String, default: '', trim: true, maxlength: 2000 },
    note: { type: String, default: '', trim: true, maxlength: 2000 },
    // A report is a draft until it is sent; drafts save as the author types.
    sentAt: { type: Date, default: null },
    // Written before the form changed: one "bid" count and free-text "upcoming".
    bid: { type: Number, default: 0, min: 0 },
    upcoming: { type: String, default: '', trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

// One personal report per person and period, and one group report per group and
// period, whoever of its bosses saved it last.
reportSchema.index({ author: 1, type: 1, period: 1 }, { unique: true, partialFilterExpression: { scope: 'personal' } });
reportSchema.index({ group: 1, type: 1, period: 1 }, { unique: true, partialFilterExpression: { scope: 'group' } });
reportSchema.index({ type: 1, period: 1, scope: 1 });
reportSchema.index({ periodStart: 1, periodEnd: 1 });
reportSchema.index({ 'work.task': 1 });

export default mongoose.model('Report', reportSchema);
