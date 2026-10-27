import { useState } from 'react';
import { useToast } from '../../components/Toast.jsx';
import { timeAgo } from '../../format.js';
import Icon from '../../components/Icon.jsx';

// One line under the Finance toolbar when amounts are shown in another
// currency: the rate in use, where it came from and how fresh it is.
export default function RateNote({ currency }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (currency.code === currency.base) return null;
  const refresh = async () => {
    setBusy(true);
    try { await currency.refresh(); toast('Exchange rates refreshed'); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <p className="muted small rate-note">
      <Icon name="coins" size={14} />
      <span>
        Recorded in {currency.base}, shown in {currency.code}: 1 {currency.base} = {currency.rate} {currency.code}
        {currency.rateDate ? ` · rate of ${currency.rateDate}` : ''}
        {currency.fetchedAt ? ` · checked ${timeAgo(currency.fetchedAt)}` : ' · not refreshed yet'}
        {currency.source ? ` · ${currency.source}` : ''}, refreshed every day.
      </span>
      {currency.canRefresh && <button type="button" className="link small" onClick={refresh} disabled={busy}>{busy ? 'Refreshing...' : 'Refresh now'}</button>}
    </p>
  );
}
