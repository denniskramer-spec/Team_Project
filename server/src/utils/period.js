// Reporting periods. Keys are stable strings used in URLs and stored on reports:
//   daily   2026-09-22
//   weekly  2026-W39   (ISO week, Monday-Sunday)
//   monthly 2026-09
//   quarterly 2026-Q3
//   halfyear  2026-H2
//   annual  2026
// All dates are handled in UTC so a period means the same thing everywhere.

import { badRequest } from './httpError.js';

export const PERIOD_TYPES = ['daily', 'weekly', 'monthly', 'quarterly', 'halfyear', 'annual'];

const pad = (n) => String(n).padStart(2, '0');
const utc = (y, m = 0, d = 1) => new Date(Date.UTC(y, m, d));

// Monday of the ISO week containing `date`.
function isoWeekStart(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d;
}

function isoWeekNumber(date) {
  const thursday = isoWeekStart(date);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstWeekStart = isoWeekStart(firstThursday);
  const week = Math.round((thursday - firstWeekStart) / (7 * 24 * 3600 * 1000)) + 1;
  return { year: thursday.getUTCFullYear(), week };
}

export function periodKey(type, date = new Date()) {
  const d = new Date(date);
  switch (type) {
    case 'daily': return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    case 'weekly': {
      const { year, week } = isoWeekNumber(d);
      return `${year}-W${pad(week)}`;
    }
    case 'monthly': return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    case 'quarterly': return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    case 'halfyear': return `${d.getUTCFullYear()}-H${d.getUTCMonth() < 6 ? 1 : 2}`;
    case 'annual': return String(d.getUTCFullYear());
    default: throw badRequest('Unknown report type');
  }
}

const DAY_LABEL = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
const RANGE_LABEL = { day: 'numeric', month: 'short', timeZone: 'UTC' };

// Turns a key into { key, start, end, label }. `end` is exclusive.
// Keys that only look valid (2026-02-31, week 53 of a 52-week year) would
// roll over into another period, so they are rejected.
export function parsePeriod(type, key) {
  const period = parseKey(type, key);
  if (periodKey(type, period.start) !== key) throw badRequest(`"${key}" is not a real ${type} period`);
  return period;
}

function parseKey(type, key) {
  if (!PERIOD_TYPES.includes(type)) throw badRequest('Unknown report type');
  let start;
  let end;

  if (type === 'daily') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw badRequest('Invalid day, expected YYYY-MM-DD');
    start = new Date(`${key}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) throw badRequest('Invalid day');
    end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { key, start, end, label: start.toLocaleDateString('en-GB', DAY_LABEL) };
  }

  if (type === 'weekly') {
    const m = /^(\d{4})-W(\d{2})$/.exec(key);
    if (!m) throw badRequest('Invalid week, expected YYYY-Www');
    const week = Number(m[2]);
    if (week < 1 || week > 53) throw badRequest('Invalid week number');
    const firstWeekStart = isoWeekStart(utc(Number(m[1]), 0, 4));
    start = new Date(firstWeekStart);
    start.setUTCDate(start.getUTCDate() + (week - 1) * 7);
    end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    const last = new Date(end);
    last.setUTCDate(last.getUTCDate() - 1);
    const label = `Week ${week} · ${start.toLocaleDateString('en-GB', RANGE_LABEL)} – ${last.toLocaleDateString('en-GB', { ...RANGE_LABEL, year: 'numeric' })}`;
    return { key, start, end, label };
  }

  if (type === 'monthly') {
    const m = /^(\d{4})-(\d{2})$/.exec(key);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw badRequest('Invalid month, expected YYYY-MM');
    start = utc(Number(m[1]), Number(m[2]) - 1, 1);
    end = utc(Number(m[1]), Number(m[2]), 1);
    return { key, start, end, label: start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  }

  if (type === 'quarterly') {
    const m = /^(\d{4})-Q([1-4])$/.exec(key);
    if (!m) throw badRequest('Invalid quarter, expected YYYY-Qn');
    const q = Number(m[2]);
    start = utc(Number(m[1]), (q - 1) * 3, 1);
    end = utc(Number(m[1]), q * 3, 1);
    return { key, start, end, label: `Q${q} ${m[1]}` };
  }

  if (type === 'halfyear') {
    const m = /^(\d{4})-H([12])$/.exec(key);
    if (!m) throw badRequest('Invalid half-year, expected YYYY-Hn');
    const h = Number(m[2]);
    start = utc(Number(m[1]), (h - 1) * 6, 1);
    end = utc(Number(m[1]), h * 6, 1);
    return { key, start, end, label: `${h === 1 ? 'First' : 'Second'} half ${m[1]}` };
  }

  if (!/^\d{4}$/.test(key)) throw badRequest('Invalid year, expected YYYY');
  start = utc(Number(key), 0, 1);
  end = utc(Number(key) + 1, 0, 1);
  return { key, start, end, label: key };
}

// Key for the period `delta` steps before (-1) or after (+1) the given one.
export function shiftPeriod(type, key, delta) {
  const { start } = parsePeriod(type, key);
  const d = new Date(start);
  if (type === 'daily') d.setUTCDate(d.getUTCDate() + delta);
  else if (type === 'weekly') d.setUTCDate(d.getUTCDate() + delta * 7);
  else if (type === 'monthly') d.setUTCMonth(d.getUTCMonth() + delta);
  else if (type === 'quarterly') d.setUTCMonth(d.getUTCMonth() + delta * 3);
  else if (type === 'halfyear') d.setUTCMonth(d.getUTCMonth() + delta * 6);
  else d.setUTCFullYear(d.getUTCFullYear() + delta);
  return periodKey(type, d);
}

export const isFuturePeriod = (type, key) => parsePeriod(type, key).start > new Date();
