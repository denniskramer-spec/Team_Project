import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { load, save } from '../../storage.js';
import { formatAmount } from '../../format.js';

const KEY = 'bm.currency';
const SYMBOLS = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$', BRL: 'R$' };
const EMPTY = { base: 'USD', rates: { USD: 1 }, currencies: ['USD'], source: '', rateDate: '', fetchedAt: null, canRefresh: false };

// Shared across the Finance pages: today's rates are fetched once per
// session, and the chosen currency is remembered on this device.
let cached = null;
let loading = null;
const listeners = new Set();
const tell = () => listeners.forEach((fn) => fn());

async function fetchRates(force = false) {
  if (cached && !force) return cached;
  if (!loading) {
    loading = api('/finance/rates').then((d) => { cached = d; return d; }).catch(() => cached ?? EMPTY).finally(() => { loading = null; tell(); });
  }
  return loading;
}

// The currency the Finance pages show amounts in, with the rate to apply.
//   code      the chosen currency (USD = the base, as recorded)
//   rate      how many of it one base unit buys today
//   convert   base amount -> chosen currency
//   money     base amount -> "€1,234.5"
export function useCurrency() {
  const [code, setCodeState] = useState(() => load(KEY, 'USD'));
  const [rates, setRates] = useState(() => cached ?? EMPTY);

  useEffect(() => {
    const sync = () => setRates(cached ?? EMPTY);
    listeners.add(sync);
    fetchRates().then(sync);
    return () => listeners.delete(sync);
  }, []);

  const setCode = useCallback((next) => { setCodeState(next); save(KEY, next); }, []);
  const refresh = useCallback(async () => {
    cached = await api('/finance/rates/refresh', { method: 'POST' });
    tell();
    return cached;
  }, []);

  // A currency without a rate yet (the first refresh has not run) falls back to the base.
  const known = code === rates.base || Number.isFinite(rates.rates?.[code]);
  const shown = known ? code : rates.base;
  const rate = shown === rates.base ? 1 : rates.rates[shown];
  const symbol = SYMBOLS[shown] ?? `${shown} `;
  const convert = useCallback((n) => (Number(n) || 0) * rate, [rate]);
  const money = useCallback((n) => `${symbol}${formatAmount((Number(n) || 0) * rate)}`, [symbol, rate]);

  return {
    code: shown, setCode, rate, symbol, convert, money, refresh,
    base: rates.base, rates: rates.rates, currencies: rates.currencies ?? ['USD'],
    rateDate: rates.rateDate, fetchedAt: rates.fetchedAt, source: rates.source, canRefresh: rates.canRefresh,
    stale: !rates.fetchedAt,
  };
}
