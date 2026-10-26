import { useState } from 'react';
import { api } from '../../api.js';
import { useLiveData } from '../../useLiveData.js';
import { useToast } from '../../components/Toast.jsx';
import { formatAmount, timeAgo } from '../../format.js';
import Icon from '../../components/Icon.jsx';

// The fee of one method: shown to everyone; the published-rate ones can be
// edited by an admin or the leader, the automatic ones refresh daily.
function FeeRow({ method, canManage, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ feePercent: method.feePercent, feeFixed: method.feeFixed });
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/payments/fees/${method.key}`, { method: 'PATCH', body: form });
      toast(`${method.label} fee updated`);
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr>
      <td data-label="Method"><span className="strong">{method.label}</span></td>
      <td data-label="Fee" className="num">
        {editing ? (
          <form id={`fee-${method.key}`} className="fee-edit" onSubmit={save}>
            <input type="number" min="0" max="100" step="0.01" value={form.feePercent} onChange={(e) => setForm({ ...form, feePercent: e.target.value })} aria-label="Fee %" />
            <span className="muted">% +</span>
            <input type="number" min="0" step="0.01" value={form.feeFixed} onChange={(e) => setForm({ ...form, feeFixed: e.target.value })} aria-label="Fixed fee" />
          </form>
        ) : (
          <span className="strong">{method.feePercent ? `${method.feePercent}%` : ''}{method.feePercent && method.feeFixed ? ' + ' : ''}{method.feeFixed ? formatAmount(method.feeFixed) : ''}{!method.feePercent && !method.feeFixed ? 'free' : ''}</span>
        )}
      </td>
      <td data-label="Source">
        {method.auto
          ? <span className="status-pill active" title={method.detail}>auto · daily</span>
          : <span className="status-pill pending" title={method.detail}>published rate</span>}
        <div className="muted small">{method.detail}</div>
      </td>
      <td data-label="Updated" className="muted small">
        {method.auto
          ? (method.checkedAt ? `checked ${timeAgo(method.checkedAt)}` : 'not checked yet')
          : (method.updatedAt ? `set ${timeAgo(method.updatedAt)}` : '—')}
      </td>
      <td className="cell-actions">
        {canManage && !method.auto && (editing ? (
          <span className="fee-actions">
            <button className="btn primary small-btn" type="submit" form={`fee-${method.key}`} disabled={busy}>Save</button>
            <button className="btn small-btn" type="button" onClick={() => { setEditing(false); setForm({ feePercent: method.feePercent, feeFixed: method.feeFixed }); }}>Cancel</button>
          </span>
        ) : (
          <button className="icon-btn" onClick={() => setEditing(true)} aria-label={`Edit ${method.label} fee`}><Icon name="edit" size={16} /></button>
        ))}
      </td>
    </tr>
  );
}

// Admin → Payment fees: every payment method with its current fee.
export default function PaymentFees() {
  const toast = useToast();
  const { data, error, reload } = useLiveData('/payments/fees');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await api('/payments/fees/refresh', { method: 'POST' });
      const failed = Object.entries(r.results).filter(([, v]) => v.error);
      if (failed.length) toast.error(`Could not refresh ${failed.map(([k]) => k).join(', ')}`);
      else toast('Fees refreshed');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page muted">Loading...</div>;

  return (
    <div className="page">
      <div className="toolbar">
        <div className="page-title">
          <h2>Payment fees</h2>
          <span className="muted small">What each payment method costs. Income records always use the current fee; nobody types it in.</span>
        </div>
        {data.canManage && (
          <button className="btn toolbar-right" onClick={refresh} disabled={busy}>{busy ? 'Refreshing...' : 'Refresh now'}</button>
        )}
      </div>
      <div className="note">
        <Icon name="coins" size={16} />
        <span>
          <strong>Auto · daily</strong> fees are read every day from public sources: a live Wise quote, the Bitcoin network fee from mempool.space,
          and the Tron network cost at the current TRX price. <strong>Published rate</strong> fees have no public source; an admin or the leader keeps them in line with the provider's pricing page.
        </span>
      </div>
      <section className="card">
        <table className="table fee-table">
          <thead><tr><th>Method</th><th className="num">Fee</th><th>Source</th><th>Updated</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {data.methods.map((m) => <FeeRow key={m.key} method={m} canManage={data.canManage} onChanged={reload} />)}
          </tbody>
        </table>
      </section>
    </div>
  );
}
