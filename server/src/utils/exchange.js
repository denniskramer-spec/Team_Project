import ExchangeRate from '../models/ExchangeRate.js';
import { CURRENCIES } from '../models/Task.js';

// Exchange rates for the Finance pages. Amounts are recorded in the team's
// base currency (USD); the pages can show them in any of the app's
// currencies at the day's rate. Rates come from the European Central Bank
// through frankfurter.app (no key, one fix per working day) and, when that
// is unreachable, from open.er-api.com; a failed refresh keeps the last
// rates. One USD is always 1.

export const BASE = 'USD';
const TIMEOUT_MS = 10000;
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

export async function refreshRates() {
  const fetched = await fetchRates();
  const doc = await ExchangeRate.findOneAndUpdate(
    { base: BASE },
    { rates: fetched.rates, source: fetched.source, rateDate: fetched.rateDate, fetchedAt: new Date() },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  current = fromDoc(doc);
  return current;
}

// Runs the refresh now and then once a day.
export function scheduleRateRefresh() {
  const run = () => refreshRates()
    .then((r) => console.log(`Exchange rates refreshed (${r.source}, ${r.rateDate}): ${OTHERS.map((c) => `${c} ${r.rates[c]}`).join(', ')}`))
    .catch((err) => console.error('Exchange rate refresh failed:', err.message));
  run();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}
