import fs from 'node:fs';

// The 50,000 most used passwords from leaked password lists (SecLists,
// xato-net 10 million, MIT licence), cut to the ones the length and number
// rules would let through, lower case. Read once, on first use.
const FILE = new URL('../config/common-passwords.txt', import.meta.url);
let list = null;

export function isCommonPassword(password) {
  if (typeof password !== 'string') return false;
  list ??= new Set(fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean));
  return list.has(password.toLowerCase());
}
