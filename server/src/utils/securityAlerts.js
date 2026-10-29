import { getIO } from '../socket/index.js';

// Some security log entries can't wait for someone to open Admin → Security:
// the admins and the team leader get a popup the moment one is written
// (client/src/alerts/SecurityAlerts.jsx). Repeats from the same person or
// program are held back for a while, so a database tool browsing collection
// after collection raises one alert, not a hundred.

const REPEAT_MS = 10 * 60 * 1000;
const ROOMS = ['role:admin', 'role:leader'];

// The first rule an entry matches decides its alert.
const RULES = [
  { kind: 'tamper', test: (e) => e.flags?.includes('tamper'), title: 'The security log or its recording was touched' },
  { kind: 'outside-write', test: (e) => e.flags?.includes('outside-write'), title: 'Data changed directly in the database, outside the app' },
  { kind: 'outside', test: (e) => e.flags?.includes('outside-app'), title: 'Someone is reading the database directly, outside the app' },
  { kind: 'copy', test: (e) => e.flags?.includes('sensitive-copy'), title: 'Bank or card details were copied' },
  { kind: 'new-ip', test: (e) => e.action === 'auth.login' && e.flags?.includes('new-ip'), title: 'Login from an address this account never used' },
];

const lastSent = new Map();

const whoOf = (e) => e.user?.name ?? (e.username || null) ?? (e.method === 'DB' ? e.userAgent || 'a database client' : null) ?? e.ip ?? 'someone';

// The alert an entry raises, or null.
export function alertOf(entry) {
  const rule = RULES.find((r) => r.test(entry));
  if (!rule) return null;
  const who = whoOf(entry);
  const where = entry.target?.label || entry.details?.page || '';
  return {
    id: String(entry._id ?? ''),
    kind: rule.kind,
    title: rule.title,
    text: [who, where, entry.ip ? `from ${entry.ip}` : ''].filter(Boolean).join(' · '),
    at: entry.at ?? new Date(),
    key: `${rule.kind}:${entry.user?.id ?? entry.username ?? ''}:${entry.ip ?? ''}:${entry.userAgent ?? ''}`,
  };
}

// Sends the alert for a freshly written entry, unless the same one went out
// a moment ago.
export function raiseSecurityAlert(entry, now = Date.now()) {
  const alert = alertOf(entry);
  if (!alert) return false;
  const last = lastSent.get(alert.key);
  if (last && now - last < REPEAT_MS) return false;
  lastSent.set(alert.key, now);
  if (lastSent.size > 1000) {
    for (const [key, at] of lastSent) if (now - at >= REPEAT_MS) lastSent.delete(key);
  }
  const { key, ...payload } = alert;
  getIO()?.to(ROOMS).emit('security:alert', payload);
  return true;
}
