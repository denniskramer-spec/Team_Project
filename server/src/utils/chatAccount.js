import { badRequest } from './httpError.js';
import { checkText } from './validate.js';
import { PLATFORMS } from '../models/ChatAccount.js';

export const PLATFORM_NAMES = { discord: 'Discord', telegram: 'Telegram', whatsapp: 'WhatsApp' };

export function checkPlatform(value) {
  if (!PLATFORMS.includes(value)) throw badRequest('Choose Discord, Telegram or WhatsApp');
  return value;
}

// A phone number as typed: digits with the usual separators, at least 6
// digits, kept as text so a leading + or 0 survives.
export function checkPhone(value, label = 'Phone number', { required = false } = {}) {
  const text = checkText(value, label, 40, { required });
  if (!text) return '';
  if (!/^\+?[0-9 ()./-]+$/.test(text) || (text.match(/\d/g) ?? []).length < 6) {
    throw badRequest(`${label} must be a phone number, like +1 809 292 4098`);
  }
  return text;
}

// What identifies the account on its platform: a Discord username, a
// Telegram handle (always stored with its @) or a WhatsApp phone number.
export function checkAccountName(platform, value) {
  if (platform === 'whatsapp') return checkPhone(value, 'Account name', { required: true });
  const text = checkText(value, 'Account name', 80);
  if (!text) throw badRequest('Give the account a name');
  if (platform === 'telegram') {
    const handle = text.startsWith('@') ? text : `@${text}`;
    if (!/^@[A-Za-z0-9_]{3,}$/.test(handle)) throw badRequest('A Telegram handle is letters, numbers and _ (at least 3)');
    return handle;
  }
  return text;
}
