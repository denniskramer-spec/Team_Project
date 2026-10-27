import { AsyncLocalStorage } from 'node:async_hooks';

// The request behind the database work in flight. The audit middleware opens
// a context per request; the data layer (utils/auditPlugin.js) adds to it
// every record it creates, changes or removes, so the security log entry for
// the request can say exactly what was touched, whichever route did it.
const storage = new AsyncLocalStorage();

export const runWithAudit = (ctx, fn) => storage.run(ctx, fn);
export const currentAudit = () => storage.getStore() ?? null;

export const newAuditContext = (req) => ({ req, changes: [], archived: new Set() });
