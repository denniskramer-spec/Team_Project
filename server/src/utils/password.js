import crypto from 'node:crypto';

// Readable temporary password that always meets the password rules
// (letters + digits, 12 characters). Users must change it at first login.
export function tempPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (set, n) => Array.from({ length: n }, () => set[crypto.randomInt(set.length)]).join('');
  return pick(letters, 4) + pick(digits, 2) + pick(letters, 4) + pick(digits, 2);
}
