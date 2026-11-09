import AuditLog from '../models/AuditLog.js';
import DeletedRecord from '../models/DeletedRecord.js';
import { env } from '../config/env.js';
import { recordAudit } from './audit.js';

// How long the security log and the kept copies of deleted records are
// held. Both are append-only and kept for good unless AUDIT_RETENTION_DAYS
// or DELETED_RETENTION_DAYS says otherwise (server/.env); then, once a day,
// entries older than that are removed and the removal itself is logged.
// The writes go to the collections directly: the models refuse every
// delete, and that stays so for everything else. Files a purged copy
// pointed to are picked up by the hourly upload sweep (utils/uploads.js)
// once nothing refers to them.

const DAY_MS = 24 * 60 * 60 * 1000;

export async function purgeExpired({ auditDays = env.auditRetentionDays, deletedDays = env.deletedRetentionDays } = {}, now = Date.now()) {
  const removed = {};
  if (auditDays > 0) {
    const r = await AuditLog.collection.deleteMany({ at: { $lt: new Date(now - auditDays * DAY_MS) } });
    removed.auditEntries = r.deletedCount;
  }
  if (deletedDays > 0) {
    const r = await DeletedRecord.collection.deleteMany({ deletedAt: { $lt: new Date(now - deletedDays * DAY_MS) } });
    removed.deletedRecords = r.deletedCount;
  }
  if (Object.values(removed).some(Boolean)) {
    await recordAudit({
      action: 'security.retention', user: null, ip: '', userAgent: 'retention job', method: 'JOB', path: '', status: 200,
      details: { ...removed, auditDays, deletedDays }, flags: [],
    });
  }
  return removed;
}

// Runs the purge now and then once a day, when a retention is set.
export function scheduleRetention() {
  if (!(env.auditRetentionDays > 0) && !(env.deletedRetentionDays > 0)) return;
  const run = () => purgeExpired()
    .then((r) => { if (Object.values(r).some(Boolean)) console.log(`Retention: removed ${r.auditEntries ?? 0} log entries and ${r.deletedRecords ?? 0} deleted-record copies`); })
    .catch((err) => console.error('Retention purge failed:', err.message));
  run();
  setInterval(run, DAY_MS).unref();
}
