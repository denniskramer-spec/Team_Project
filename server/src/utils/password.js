import crypto from 'node:crypto';

// What Members → Reset password sets. Login lets it through only while the
// account must change its password, and the new one has to pass the rules.
export const RESET_PASSWORD = '123456';

// Readable temporary password that always meets the password rules
// (letters + digits, 12 characters). Users must change it at first login.
export function tempPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (set, n) => Array.from({ length: n }, () => set[crypto.randomInt(set.length)]).join('');
  return pick(letters, 4) + pick(digits, 2) + pick(letters, 4) + pick(digits, 2);
}
