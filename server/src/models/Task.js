import mongoose from 'mongoose';

export const TASK_STATES = ['not_done', 'progress', 'done'];

// A task someone signs up for: owner, name, period and salary (from the guide).
const taskSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Copied from the owner so group scoping stays cheap.
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    salary: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: TASK_STATES, default: 'not_done' },
    note: { type: String, default: '', trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

taskSchema.index({ owner: 1, startDate: -1 });
taskSchema.index({ group: 1, startDate: -1 });
taskSchema.index({ startDate: 1, endDate: 1 });

export default mongoose.model('Task', taskSchema);
