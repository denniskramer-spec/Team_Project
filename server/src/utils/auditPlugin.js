import mongoose from 'mongoose';
import { currentAudit } from './auditContext.js';
import { archiveDeleted, sanitize } from './audit.js';

// Applied to every model: records, in the request's audit context, each
// record saved, changed or removed through Mongoose, with the fields that
// changed (old and new value). Deletes are also kept whole in DeletedRecord
// before they happen, even where a route did not call archiveDeleted itself,
// so nothing can leave the database without a copy and a log entry.
//
// It must be registered before the models are compiled: it is imported first
// in index.js and app.js.

// Bookkeeping collections: never worth an entry.
const QUIET = new Set(['AuditLog', 'DeletedRecord', 'ChatRead', 'Counter', 'RevokedToken', 'ExchangeRate']);
// Fields that change on their own.
const NOISE = new Set(['_id', '__v', 'createdAt', 'updatedAt', 'lastSeenAt', 'lastLoginAt']);
const MANY = 50;

const LABELS = {
  User: (d) => `${d.name ?? ''} (@${d.username ?? ''})`,
  Report: (d) => `${d.scope ?? ''} ${d.type ?? ''} report ${d.period ?? ''}`,
  Plan: (d) => `${d.type ?? ''} plan ${d.period ?? ''}`,
  Message: (d) => String(d.content ?? ''),
  Outcome: (d) => `${d.reason ?? ''} · ${d.split?.total ?? d.amount ?? ''}`,
  Income: (d) => `${d.amount ?? ''} ${d.currency ?? ''} ${d.from ? `from ${d.from}` : ''}`,
  PaymentFee: (d) => d.key ?? '',
  ChatAccount: (d) => `${d.platform ?? ''} ${d.name ?? ''}`,
  Instruction: (d) => d.title || String(d.content ?? ''),
};

// A short name for a record in the log: its name, title or what it is about.
export function labelOf(model, doc) {
  const d = typeof doc?.toObject === 'function' ? doc.toObject({ depopulate: true }) : doc ?? {};
  const text = LABELS[model] ? LABELS[model](d) : (d.name ?? d.title ?? d.reason ?? d.label ?? d.key ?? '');
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

export const plainOf = (doc) => (typeof doc?.toObject === 'function'
  ? doc.toObject({ depopulate: true, flattenMaps: true, versionKey: false })
  : doc);

// A field's value as the log may keep it: hidden when the field is a secret.
const safe = (key, value) => sanitize({ [key]: value })[key] ?? null;

// The top-level fields that differ between two copies of a record, as
// { field: { from, to } }, or null when nothing of note changed. Secrets are
// hidden the same way as everywhere else in the log.
export function diffRecords(before = {}, after = {}) {
  const fields = {};
  for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    if (NOISE.has(key)) continue;
    if (JSON.stringify(before?.[key] ?? null) === JSON.stringify(after?.[key] ?? null)) continue;
    // A changed password shows as changed, never as what it was or is.
    fields[key] = { from: safe(key, before?.[key]), to: safe(key, after?.[key]) };
  }
  return Object.keys(fields).length ? fields : null;
}

function note(ctx, change) {
  if (ctx.changes.length >= MANY) {
    ctx.more = (ctx.more ?? 0) + 1;
    return;
  }
  ctx.changes.push(change);
}

async function keepCopies(Model, docs) {
  const ctx = currentAudit();
  if (!ctx) return;
  const model = Model.modelName;
  const fresh = docs.filter((d) => d && !ctx.archived.has(String(d._id)));
  if (!fresh.length) return;
  await archiveDeleted(fresh, ctx.req, { model, label: labelOf(model, fresh[0]) });
}

export function auditPlugin(schema) {
  schema.post('init', function remember() {
    this.$locals.auditBefore = plainOf(this);
  });

  schema.pre('save', function saved() {
    if (this.$isSubdocument) return; // the parent's save covers it
    const ctx = currentAudit();
    const model = this.constructor.modelName;
    if (!ctx || QUIET.has(model)) return;
    const after = plainOf(this);
    if (this.isNew) {
      note(ctx, { op: 'create', model, id: this._id, label: labelOf(model, after) });
    } else {
      const fields = diffRecords(this.$locals.auditBefore, after);
      if (fields) note(ctx, { op: 'update', model, id: this._id, label: labelOf(model, after), fields });
    }
    this.$locals.auditBefore = after;
  });

  schema.pre('deleteOne', { document: true, query: false }, async function removing() {
    if (QUIET.has(this.constructor.modelName)) return;
    await keepCopies(this.constructor, [this]);
  });

  for (const op of ['deleteOne', 'deleteMany', 'findOneAndDelete']) {
    schema.pre(op, { document: false, query: true }, async function removing() {
      if (!currentAudit() || QUIET.has(this.model.modelName)) return;
      const docs = await this.model.find(this.getFilter()).limit(MANY);
      await keepCopies(this.model, docs);
    });
  }

  for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne']) {
    schema.pre(op, { document: false, query: true }, async function changing() {
      if (!currentAudit() || QUIET.has(this.model.modelName)) return;
      this._auditBefore = await this.model.find(this.getFilter()).limit(MANY).lean();
    });
    schema.post(op, { document: false, query: true }, async function changed() {
      const before = this._auditBefore;
      const ctx = currentAudit();
      if (!before || !ctx) return;
      const model = this.model.modelName;
      if (!before.length) {
        if (!this.getOptions().upsert) return;
        const made = await this.model.findOne(this.getFilter()).lean();
        if (made) note(ctx, { op: 'create', model, id: made._id, label: labelOf(model, made) });
        return;
      }
      const after = await this.model.find({ _id: { $in: before.map((b) => b._id) } }).lean();
      const byId = new Map(after.map((a) => [String(a._id), a]));
      for (const was of before) {
        const now = byId.get(String(was._id));
        const fields = diffRecords(was, now ?? was);
        if (fields) note(ctx, { op: 'update', model, id: was._id, label: labelOf(model, now ?? was), fields });
      }
    });
  }
}

mongoose.plugin(auditPlugin);
