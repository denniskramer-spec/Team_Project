import mongoose from 'mongoose';

// Money going out: date, amount, the reason and a comment. Paid for one
// member, or with no member for a team cost (of one group, or of the whole
// team when group is null too). Only the team leader and bosses record
// these (see visibility.js).
const outcomeSchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true, maxlength: 120 },
    comment: { type: String, default: '', trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

outcomeSchema.index({ member: 1, date: -1 });
outcomeSchema.index({ group: 1, date: -1 });
outcomeSchema.index({ date: 1 });

export default mongoose.model('Outcome', outcomeSchema);
