import ExchangeRate from '../models/ExchangeRate.js';
import { CURRENCIES } from '../models/Task.js';
import { badRequest } from './httpError.js';

// Exchange rates for the Finance pages. Amounts are recorded in the team's
// base currency (USD); the pages can show them in any of the app's
// currencies at the day's rate. Rates come from the European Central Bank
// through frankfurter.app (no key, one fix per working day) and, when that
// is unreachable, from open.er-api.com; a failed refresh keeps the last
// rates. One USD is always 1.

export const BASE = 'USD';
const TIMEOUT_MS = 10000;
// Rates are checked this often while the server runs, and again whenever
// someone asks for them and the stored ones are older than a day.
const REFRESH_EVERY_MS = 6 * 60 * 60 * 1000;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const OTHERS = CURRENCIES.filter((c) => c !== BASE);

let current = { base: BASE, rates: { [BASE]: 1 }, source: '', rateDate: '', fetchedAt: null };

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json', 'user-agent': 'business-manager rate refresh' } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

const round = (n) => Math.round(n * 1e6) / 1e6;

// { rates, source, rateDate } from the first source that answers with
// every currency the app uses.
async function fetchRates() {
  const sources = [
    { name: 'European Central Bank (frankfurter.app)', run: async () => { const d = await getJson(`https://api.frankfurter.app/latest?from=${BASE}&to=${OTHERS.join(',')}`); return { rates: d.rates, rateDate: d.date }; } },
    { name: 'open.er-api.com', run: async () => { const d = await getJson(`https://open.er-api.com/v6/latest/${BASE}`); return { rates: d.rates, rateDate: d.time_last_update_utc ? new Date(d.time_last_update_utc).toISOString().slice(0, 10) : '' }; } },
  ];
  const errors = [];
  for (const s of sources) {
    try {
      const { rates, rateDate } = await s.run();
      const picked = { [BASE]: 1 };
      for (const c of OTHERS) {
        const r = Number(rates?.[c]);
        if (!Number.isFinite(r) || r <= 0) throw new Error(`no rate for ${c}`);
        picked[c] = round(r);
      }
      return { rates: picked, source: s.name, rateDate: rateDate || '' };
    } catch (err) {
      errors.push(`${s.name}: ${err.message}`);
    }
  }
  throw new Error(errors.join('; '));
}

const fromDoc = (doc) => ({
  base: doc.base,
  rates: { [BASE]: 1, ...Object.fromEntries(doc.rates instanceof Map ? doc.rates : Object.entries(doc.rates ?? {})) },
  source: doc.source ?? '',
  rateDate: doc.rateDate ?? '',
  fetchedAt: doc.fetchedAt ?? null,
});

// Loads the stored rates into memory (the base alone until the first refresh).
export async function loadRates() {
  const doc = await ExchangeRate.findOne({ base: BASE }).lean();
  if (doc) current = fromDoc(doc);
  return current;
}

export const currentRates = () => ({ ...current, currencies: CURRENCIES });

export const ratesStale = () => !current.fetchedAt || Date.now() - new Date(current.fetchedAt).getTime() > STALE_AFTER_MS;

let refreshing = null;

// One refresh at a time: a second caller waits for the one under way.
export function refreshRates() {
  if (!refreshing) {
    refreshing = (async () => {
      const fetched = await fetchRates();
      const doc = await ExchangeRate.findOneAndUpdate(
        { base: BASE },
        { rates: fetched.rates, source: fetched.source, rateDate: fetched.rateDate, fetchedAt: new Date() },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).lean();
      current = fromDoc(doc);
      return current;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

const logRefresh = () => refreshRates()
  .then((r) => console.log(`Exchange rates refreshed (${r.source}, ${r.rateDate}): ${OTHERS.map((c) => `${c} ${r.rates[c]}`).join(', ')}`))
  .catch((err) => console.error('Exchange rate refresh failed:', err.message));

// Refreshes in the background when the stored rates are a day old (the
// server was off, or a refresh failed); the caller gets today's rates on
// its next request.
export function refreshIfStale() {
  if (ratesStale() && !refreshing) logRefresh();
}

// Runs the refresh now and then every few hours.
export function scheduleRateRefresh() {
  logRefresh();
  setInterval(logRefresh, REFRESH_EVERY_MS).unref();
}

// A currency code from a request body: one of the app's, the base when empty.
export function checkCurrency(value) {
  if (value === undefined || value === null || value === '') return BASE;
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!CURRENCIES.includes(code)) throw badRequest('Unknown currency');
  return code;
}

const cents = (n) => Math.round(n * 100) / 100;

// An amount typed in one currency, as the base amount it is recorded as:
//   { amount, currency, originalAmount, rate, rateDate }
// `amount` is in the base; `rate` is how much of the currency one base
// unit bought (1 for the base itself). No rate yet for the currency (the
// first refresh has not run) is an error, not a silent 1:1.
export function toBase(originalAmount, currency, rates = currentRates()) {
  const amount = Number(originalAmount) || 0;
  if (currency === rates.base) return { amount: cents(amount), currency, originalAmount: cents(amount), rate: 1, rateDate: '' };
  const rate = Number(rates.rates?.[currency]);
  if (!Number.isFinite(rate) || rate <= 0) throw badRequest(`No exchange rate for ${currency} yet, please try again in a moment or record it in ${rates.base}`);
  return { amount: cents(amount / rate), currency, originalAmount: cents(amount), rate, rateDate: rates.rateDate ?? '' };
}
