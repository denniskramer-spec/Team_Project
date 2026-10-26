import mongoose from 'mongoose';

// Shown as "Projects" in the app: the model and the API keep the Task name.
export const TASK_STATES = ['active', 'paused', 'done'];
export const PRICE_UNITS = ['hour', 'task', 'day', 'week', 'month', 'fixed'];
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'BRL'];

// A project a member works on: where it came from, the resident it is for,
// the price and the dates. Daily reports hold the work done on it (Report.work).
const taskSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Copied from the owner so group scoping stays cheap.
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Where the project came from: Upwork, LinkedIn, a referral...
    source: { type: String, default: '', trim: true, maxlength: 120 },
    // The persona or resident the project is for.
    resident: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident', default: null },
    price: { type: Number, default: 0, min: 0 },
    currency: { type: String, enum: CURRENCIES, default: 'USD' },
    priceUnit: { type: String, enum: PRICE_UNITS, default: 'hour' },
    // How this project pays: a key from utils/payments.js, or '' when unknown.
    method: { type: String, default: '', trim: true, maxlength: 20 },
    startDate: { type: Date, required: true },
    // When the project expires; empty when it is open-ended.
    endDate: { type: Date, default: null },
    status: { type: String, enum: TASK_STATES, default: 'active' },
    note: { type: String, default: '', trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

taskSchema.index({ owner: 1, startDate: -1 });
taskSchema.index({ group: 1, startDate: -1 });
taskSchema.index({ startDate: 1, endDate: 1 });
taskSchema.index({ resident: 1 });

export default mongoose.model('Task', taskSchema);
