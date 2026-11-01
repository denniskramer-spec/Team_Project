import crypto from 'node:crypto';

// What Members → Reset password sets. Anyone who knows the username could
// log in with it, so it works for RESET_VALID_HOURS only: the member logs in
// and picks a new password (which has to pass the rules) or asks for
// another reset.
export const RESET_PASSWORD = '123456';
export const RESET_VALID_HOURS = 24;

// Whether a reset password was set too long ago to log in with.
export const resetExpired = (user, now = new Date()) => Boolean(user?.mustChangePassword && user.passwordResetAt)
  && now - new Date(user.passwordResetAt) > RESET_VALID_HOURS * 60 * 60 * 1000;

// Readable temporary password that always meets the password rules
// (letters + digits, 12 characters). Users must change it at first login.
export function tempPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (set, n) => Array.from({ length: n }, () => set[crypto.randomInt(set.length)]).join('');
  return pick(letters, 4) + pick(digits, 2) + pick(letters, 4) + pick(digits, 2);
}
