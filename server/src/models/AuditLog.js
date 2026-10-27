import mongoose from 'mongoose';

// The security log: one entry for every login (and failed login), every
// request that changes data, and every look at sensitive history, with who
// did it, when, from which IP address and device, and what it touched. It is
// append-only: nothing in the app updates or removes an entry, and the
// schema refuses any attempt to (see utils/audit.js). Entries are never
// expired.
const actorSchema = new mongoose.Schema(
  { id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, name: String, username: String, role: String },
  { _id: false },
);

const targetSchema = new mongoose.Schema(
  { model: String, id: mongoose.Schema.Types.ObjectId, label: { type: String, maxlength: 200 } },
  { _id: false },
);

const auditLogSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now, required: true },
    // "<resource>.<verb>": auth.login, auth.login.failed, incomes.create,
    // tasks.delete, members.role, security.export, ...
    action: { type: String, required: true, maxlength: 60 },
    user: { type: actorSchema, default: null },
    // The username typed on a failed login (there is no user then).
    username: { type: String, default: '', maxlength: 60 },
    ip: { type: String, default: '', maxlength: 64 },
    userAgent: { type: String, default: '', maxlength: 300 },
    method: { type: String, default: '', maxlength: 10 },
    path: { type: String, default: '', maxlength: 300 },
    status: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    target: { type: targetSchema, default: null },
    // What was sent (passwords and tokens hidden) or what the route noted.
    details: { type: mongoose.Schema.Types.Mixed, default: null },
    // Things worth a second look: new-ip (a login from an address this
    // account never used), rate-limited, denied.
    flags: { type: [String], default: [] },
  },
  { versionKey: false, minimize: false },
);

auditLogSchema.index({ at: -1, _id: -1 });
auditLogSchema.index({ 'user.id': 1, at: -1 });
auditLogSchema.index({ action: 1, at: -1 });
auditLogSchema.index({ ip: 1, at: -1 });

const APPEND_ONLY = 'The security log is append-only';
const refuse = function refuse() { throw new Error(APPEND_ONLY); };
['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne',
  'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) => auditLogSchema.pre(op, refuse));
auditLogSchema.pre('save', function onlyNew(next) {
  if (!this.isNew) return next(new Error(APPEND_ONLY));
  return next();
});

export default mongoose.model('AuditLog', auditLogSchema);
