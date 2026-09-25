import mongoose from 'mongoose';

// An income record for one member: date, amount and where it came from.
const incomeSchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    from: { type: String, required: true, trim: true, maxlength: 120 },
    note: { type: String, default: '', trim: true, maxlength: 2000 },
    // Set when the income came from a task, so Checkout can link the two.
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  },
  { timestamps: true },
);

incomeSchema.index({ member: 1, date: -1 });
incomeSchema.index({ group: 1, date: -1 });
incomeSchema.index({ date: 1 });

export default mongoose.model('Income', incomeSchema);
