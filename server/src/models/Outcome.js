import mongoose from 'mongoose';

// An attached image, as stored by utils/uploads.js. The field is called
// `type`, so it needs the long form or Mongoose reads it as the path's type.
const imageSchema = new mongoose.Schema(
  { file: String, name: String, type: { type: String }, size: Number },
  { _id: false },
);

// Ties the shares of one team/group outcome together.
const splitSchema = new mongoose.Schema(
  { id: mongoose.Schema.Types.ObjectId, total: Number, count: Number, label: String },
  { _id: false },
);

// Money going out for one member: date, amount, the reason, a comment and
// image attachments. A team or group outcome is split equally into one
// record per member (see routes/outcomes.js); `split` ties those together.
// Only the team leader and bosses record these (see visibility.js).
const outcomeSchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true, maxlength: 120 },
    comment: { type: String, default: '', trim: true, maxlength: 2000 },
    images: { type: [imageSchema], default: [] },
    // Set on every share of a team/group outcome: the shared id, the total
    // that was split, how many shares, and what it was split over.
    split: { type: splitSchema, default: undefined },
  },
  { timestamps: true },
);

outcomeSchema.index({ member: 1, date: -1 });
outcomeSchema.index({ group: 1, date: -1 });
outcomeSchema.index({ date: 1 });
outcomeSchema.index({ 'split.id': 1 });

export default mongoose.model('Outcome', outcomeSchema);
