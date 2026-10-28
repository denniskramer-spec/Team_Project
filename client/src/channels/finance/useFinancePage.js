import { useLiveData } from '../../useLiveData.js';
import { useCurrency } from './useCurrency.js';
import { useFinancePeriod } from './useFinancePeriod.js';

// What every Finance page starts from: the period in the URL, the (base)
// currency amounts are shown in, and the page's data, reloaded whenever one of
// `events` arrives. Render it with <FinancePage>.
export function useFinancePage(path, events) {
  const period = useFinancePeriod();
  const currency = useCurrency();
  const live = useLiveData(`${path}?${period.query}`, events);
  return { period, currency, ...live };
}
