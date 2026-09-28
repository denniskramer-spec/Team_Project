import mongoose from 'mongoose';
import { PERIOD_TYPES } from '../utils/period.js';

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
    note: { type: String, default: '', trim: true, maxlength: 2000 },
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

export default mongoose.model('Report', reportSchema);
