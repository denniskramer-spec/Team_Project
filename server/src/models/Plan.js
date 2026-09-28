import mongoose from 'mongoose';

export const PLAN_TYPES = ['weekly', 'monthly'];
export const PLAN_STATES = ['not_done', 'progress', 'done'];

// A plan for one period. scope 'personal' = a member's own plan,
// 'group' = a boss's plan for their group.
const planSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    scope: { type: String, enum: ['personal', 'group'], default: 'personal' },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    type: { type: String, enum: PLAN_TYPES, required: true },
    period: { type: String, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    // Targets, using the same fields as reports so Checkout can compare them.
    jobBid: { type: Number, default: 0, min: 0 },
    aiBid: { type: Number, default: 0, min: 0 },
    income: { type: Number, default: 0, min: 0 },
    note: { type: String, default: '', trim: true, maxlength: 2000 },
    // Written before the form changed: one "bid" count and a task target.
    bid: { type: Number, default: 0, min: 0 },
    task: { type: Number, default: 0, min: 0 },

    // The result of the plan, which is what Checkout shows.
    status: { type: String, enum: PLAN_STATES, default: 'not_done' },
    statusUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One personal plan per person and period, and one group plan per group and
// period, whoever of its bosses saved it last.
planSchema.index({ owner: 1, type: 1, period: 1 }, { unique: true, partialFilterExpression: { scope: 'personal' } });
planSchema.index({ group: 1, type: 1, period: 1 }, { unique: true, partialFilterExpression: { scope: 'group' } });
planSchema.index({ type: 1, period: 1, group: 1 });
planSchema.index({ periodStart: 1, periodEnd: 1 });

export default mongoose.model('Plan', planSchema);
