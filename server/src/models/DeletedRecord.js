import mongoose from 'mongoose';

// Everything anyone deletes is kept here first, whole: the record exactly as
// it was, who removed it, when and from where. Like the security log it is
// append-only and never expires, so a deleted outcome, report, message or
// project can always be read back by an admin (Admin → Security).
const actorSchema = new mongoose.Schema(
  { id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, name: String, username: String, role: String },
  { _id: false },
);

const deletedRecordSchema = new mongoose.Schema(
  {
    // The model's name (Outcome, Task, Message, ...) and the record's old id.
    model: { type: String, required: true, maxlength: 40 },
    recordId: { type: mongoose.Schema.Types.ObjectId, required: true },
    label: { type: String, default: '', maxlength: 200 },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    // Uploaded files the record pointed to. They are kept on disk as long as
    // this entry exists (see utils/fileRefs.js).
    files: { type: [String], default: [] },
    deletedBy: { type: actorSchema, default: null },
    deletedAt: { type: Date, default: Date.now, required: true },
    ip: { type: String, default: '', maxlength: 64 },
    // Why the app removed it, when it was not a person's choice (a rejected
    // sign-up, a project's work dropped with it).
    reason: { type: String, default: '', maxlength: 200 },
    // Set once an admin has put the record back (Admin → Security → Deleted
    // records → Restore). The copy stays; only these two fields are ever
    // written after the entry is made, through markRestored below.
    restoredAt: { type: Date, default: null },
    restoredBy: { type: actorSchema, default: null },
  },
  { versionKey: false, minimize: false },
);

deletedRecordSchema.index({ deletedAt: -1, _id: -1 });
deletedRecordSchema.index({ model: 1, deletedAt: -1 });
deletedRecordSchema.index({ recordId: 1 });
deletedRecordSchema.index({ files: 1 });
deletedRecordSchema.index({ restoredAt: 1, deletedAt: -1 });

const APPEND_ONLY = 'Deleted records are kept for good';
const refuse = function refuse() { throw new Error(APPEND_ONLY); };
['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne',
  'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) => deletedRecordSchema.pre(op, refuse));
deletedRecordSchema.pre('save', function onlyNew(next) {
  if (!this.isNew) return next(new Error(APPEND_ONLY));
  return next();
});

// The one sanctioned write after the fact: noting that the record is back.
// It goes straight to the collection, so the guards above stay absolute for
// everything else; the snapshot itself is untouched.
deletedRecordSchema.statics.markRestored = function markRestored(id, by) {
  return this.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(String(id)), restoredAt: null },
    { $set: { restoredAt: new Date(), restoredBy: by } },
  );
};

export default mongoose.model('DeletedRecord', deletedRecordSchema);
