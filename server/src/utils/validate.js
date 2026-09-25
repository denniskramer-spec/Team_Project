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
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date > new Date()) throw badRequest('Invalid birthday');
  return date;
}
