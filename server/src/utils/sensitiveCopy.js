// What counts as a serious copy: text copied in the app that holds a bank
// account (IBAN, or a number labelled as an account, routing number or sort
// code), a payment card number or a crypto wallet address. Each find is
// checked the way banks check it (IBAN mod 97, card Luhn) so dates, phone
// numbers and record ids don't count. Only a masked form is kept: the log
// must not become a second copy of the numbers it guards.

const MAX_TEXT = 5000;

// The IBAN check: country and check digits moved to the end, letters as
// 10..35, the whole number mod 97 is 1.
function ibanValid(iban) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const digits = `${iban.slice(4)}${iban.slice(0, 4)}`.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}

function luhnValid(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

const mask = (value, head, tail = 4) => `${value.slice(0, head)}${'•'.repeat(Math.max(4, value.length - head - tail))}${value.slice(-tail)}`;

function ibans(text) {
  const found = [];
  for (const m of text.toUpperCase().matchAll(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{1,4}){3,9}/g)) {
    const compact = m[0].replace(/ /g, '');
    // Spaced groups can run into the next word: try the longest valid prefix.
    for (let len = Math.min(compact.length, 34); len >= 15; len -= 1) {
      if (ibanValid(compact.slice(0, len))) { found.push({ kind: 'iban', masked: mask(compact.slice(0, len), 4) }); break; }
    }
  }
  return found;
}

function cards(text) {
  const found = [];
  for (const m of text.matchAll(/(?<![\w-])(?:\d[ -]?){12,18}\d(?![\w-])/g)) {
    const digits = m[0].replace(/[ -]/g, '');
    if (digits.length >= 13 && /^[2-6]/.test(digits) && luhnValid(digits)) found.push({ kind: 'card', masked: mask(digits, 0) });
  }
  return found;
}

function accounts(text) {
  const found = [];
  const rx = /\b(?:account|acct|a\/c|routing|sort\s*code|aba|bsb)\s*(?:no\.?|number|num|#)?\s*[:#.-]?\s*(\d[\d -]{4,22}\d)/gi;
  for (const m of text.matchAll(rx)) {
    const digits = m[1].replace(/[ -]/g, '');
    if (digits.length >= 6 && digits.length <= 20) found.push({ kind: 'bank-account', masked: mask(digits, 0) });
  }
  return found;
}

function wallets(text) {
  const found = [];
  const rx = /\b(0x[0-9a-fA-F]{40}|T[1-9A-HJ-NP-Za-km-z]{33}|bc1[02-9ac-hj-np-z]{25,59})\b/g;
  for (const m of text.matchAll(rx)) found.push({ kind: 'wallet', masked: mask(m[1], 4) });
  return found;
}

// [{ kind, masked }, ...] for every serious number in the text, each once.
export function sensitiveIn(text) {
  if (typeof text !== 'string' || !text) return [];
  const t = text.slice(0, MAX_TEXT);
  const seen = new Set();
  return [...ibans(t), ...cards(t), ...accounts(t), ...wallets(t)].filter((f) => {
    const key = `${f.kind}:${f.masked}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}
