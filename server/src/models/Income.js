import mongoose from 'mongoose';
import { imageSchema } from './image.js';
import { CURRENCIES } from './Task.js';

// An income record for one member: date, amount and where it came from.
const incomeSchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    // Always in the team's base currency (USD): totals, fees and charts
    // work on this one.
    amount: { type: Number, required: true, min: 0 },
    // What was actually received: the currency, the amount in it and the
    // rate (currency per base unit) it was converted at, with the rate's day.
    currency: { type: String, enum: CURRENCIES, default: 'USD' },
    originalAmount: { type: Number, default: null, min: 0 },
    rate: { type: Number, default: 1, min: 0 },
    rateDate: { type: String, default: '' },
    // Where it came from, worked out on save: the project, else the resident,
    // else the payment method (older records hold what was typed).
    from: { type: String, default: '', trim: true, maxlength: 120 },
    note: { type: String, default: '', trim: true, maxlength: 2000 },
    // Set when the income came from a task, so Checkout can link the two.
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    // Screenshots of the payment, optional.
    images: { type: [imageSchema], default: [] },
    // How it arrived and what it cost: the fee comes off the amount, then the
    // resident's share (when the income relates to one), the rest is net.
    method: { type: String, default: 'other', trim: true, maxlength: 20 },
    feePercent: { type: Number, default: 0, min: 0, max: 100 },
    feeFixed: { type: Number, default: 0, min: 0 },
    feeAmount: { type: Number, default: 0, min: 0 },
    resident: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident', default: null },
    residentPercent: { type: Number, default: 0, min: 0, max: 100 },
    residentAmount: { type: Number, default: 0, min: 0 },
    net: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

incomeSchema.index({ member: 1, date: -1 });
incomeSchema.index({ group: 1, date: -1 });
incomeSchema.index({ date: 1 });

export default mongoose.model('Income', incomeSchema);
