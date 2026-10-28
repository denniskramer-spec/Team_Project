import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { formatAmount } from '../../format.js';

const SYMBOLS = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$', BRL: 'R$' };
const EMPTY = { base: 'USD', rates: { USD: 1 }, currencies: ['USD'], source: '', rateDate: '', fetchedAt: null };

// Shared across the Finance pages: today's rates are fetched once per session.
let cached = null;
let loading = null;
const listeners = new Set();
const tell = () => listeners.forEach((fn) => fn());

function fetchRates() {
  if (cached) return Promise.resolve(cached);
  if (!loading) {
    loading = api('/finance/rates').then((d) => { cached = d; return d; }).catch(() => cached ?? EMPTY).finally(() => { loading = null; tell(); });
  }
  return loading;
}

// The currency the Finance pages show amounts in: the base one, as every
// amount is recorded. Income can be typed in another currency (IncomeForm),
// which is why today's rates are here too.
//   code      the base currency ("USD")
//   money     amount -> "$1,234.5"
//   rates     how many of each currency one base unit buys today
//   limits    the server's sizes (longest duration, list caps), once loaded
export function useCurrency() {
  const [rates, setRates] = useState(() => cached ?? EMPTY);

  useEffect(() => {
    const sync = () => setRates(cached ?? EMPTY);
    listeners.add(sync);
    fetchRates().then(sync);
    return () => listeners.delete(sync);
  }, []);

  const symbol = SYMBOLS[rates.base] ?? `${rates.base} `;
  const money = useCallback((n) => `${symbol}${formatAmount(Number(n) || 0)}`, [symbol]);

  return {
    code: rates.base, base: rates.base, symbol, money,
    rates: rates.rates, currencies: rates.currencies ?? ['USD'],
    rateDate: rates.rateDate, fetchedAt: rates.fetchedAt, source: rates.source,
    limits: rates.limits,
  };
}
