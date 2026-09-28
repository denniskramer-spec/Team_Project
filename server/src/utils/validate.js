import { badRequest } from './httpError.js';

export const USERNAME_RULE = /^[a-z0-9_.]{3,30}$/;

export function requireFields(body, fields) {
  const missing = fields.filter((f) => typeof body?.[f] !== 'string' || !body[f].trim());
  if (missing.length) throw badRequest(`Missing: ${missing.join(', ')}`);
}

export function checkUsername(username) {
  const value = username.trim().toLowerCase();
  if (!USERNAME_RULE.test(value)) {
    throw badRequest('Username must be 3-30 characters: letters, numbers, "_" or "."');
  }
  return value;
}

export function checkPassword(password) {
  if (password.length < 8 || password.length > 128) {
    throw badRequest('Password must be 8-128 characters');
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw badRequest('Password must contain at least one letter and one number');
  }
  return password;
}

export function checkName(name) {
  const value = name.trim();
  if (value.length > 60) throw badRequest('Name must be 60 characters or fewer');
  return value;
}

export function parseBirthday(value) {
  if (value === undefined || value === null || value === '') return null;
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.exec(value.trim()) : null;
  if (!m) throw badRequest('Invalid birthday');
  // A birthday is a calendar day: kept at UTC midnight, and it has to exist.
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (date.getUTCMonth() !== Number(m[2]) - 1 || date.getUTCDate() !== Number(m[3])) throw badRequest('Invalid birthday');
  if (date > new Date() || date.getUTCFullYear() < 1900) throw badRequest('Invalid birthday');
  return date;
}

// Text from a request body. Anything that isn't a string or a number is
// refused rather than stored as "[object Object]".
export function checkText(value, label, max, { required = false } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string' && typeof value !== 'number') throw badRequest(`${label} must be text`);
  const text = String(value).trim();
  if (required && !text) throw badRequest(`${label} is required`);
  if (text.length > max) throw badRequest(`${label} can be at most ${max} characters`);
  return text;
}

const EARLIEST_DAY = Date.UTC(2000, 0, 1);

// A calendar day from a request body: YYYY-MM-DD (or a full ISO date-time).
// Days that don't exist (2026-02-31) are refused instead of rolling over into
// the next month, and so are dates before 2000 or over ten years ahead.
export function checkDay(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw badRequest(`Choose ${label}`);
  const name = `${label[0].toUpperCase()}${label.slice(1)}`;
  const text = value.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.exec(text);
  const day = m ? new Date(m[4] ? text : `${text}T00:00:00.000Z`) : null;
  // The calendar day itself must exist: build it and compare the parts.
  const real = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!day || Number.isNaN(day.getTime()) || real.getUTCMonth() !== Number(m[2]) - 1 || real.getUTCDate() !== Number(m[3])) {
    throw badRequest(`${name} is not a real date`);
  }
  const latest = new Date();
  latest.setUTCFullYear(latest.getUTCFullYear() + 10);
  if (day.getTime() < EARLIEST_DAY || day > latest) throw badRequest(`${name} is out of range`);
  return day;
}

// An amount of money from a request body: a number (or numeric text), 0 or
// more, rounded to cents. null, booleans and lists are not amounts.
export function checkAmount(value, label = 'Amount') {
  const amount = (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) ? Number(value) : NaN;
  if (!Number.isFinite(amount) || amount < 0) throw badRequest(`${label} must be 0 or more`);
  if (amount > 1e12) throw badRequest(`${label} is too large`);
  return Math.round(amount * 100) / 100;
}
