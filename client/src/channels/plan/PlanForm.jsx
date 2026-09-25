import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { timeAgo } from '../../format.js';
import Icon from '../../components/Icon.jsx';
import StatusPicker from './StatusPicker.jsx';

const toForm = (p) => ({
  jobBid: p?.jobBid ?? '',
  aiBid: p?.aiBid ?? '',
  income: p?.income ?? '',
  note: p?.note ?? '',
  status: p?.status ?? 'not_done',
});

// Plan targets (bid, task, income, note) plus the result state.
export default function PlanForm({ title, type, period, scope = 'personal', plan, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(toForm(plan));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setForm(toForm(plan)); setDirty(false); }, [plan?.id, plan?.updatedAt, period]);

  const set = (key) => (e) => { setForm({ ...form, [key]: e.target.value }); setDirty(true); };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/plans', { method: 'PUT', body: { ...form, type, period, scope } });
      toast(plan ? 'Plan updated' : 'Plan saved');
      setDirty(false);
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Changing the result of an existing plan saves straight away.
  const setStatus = async (status) => {
    setForm((f) => ({ ...f, status }));
    if (!plan) { setDirty(true); return; }
    try {
      await api(`/plans/${plan.id}/status`, { method: 'PATCH', body: { status } });
      onSaved();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <form className="card plan-form" onSubmit={save}>
      <div className="report-form-head">
        <Icon name={scope === 'group' ? 'users' : 'target'} size={16} />
        <strong>{title}</strong>
        {plan
          ? <span className="muted small">Saved · updated {timeAgo(plan.updatedAt)}</span>
          : <span className="tag missing-tag">No plan yet</span>}
      </div>

      <div className="number-grid">
        <label>
          Job bids planned
          <input type="number" min="0" step="1" value={form.jobBid} onChange={set('jobBid')} placeholder="0" />
        </label>
        <label>
          AI training bids planned
          <input type="number" min="0" step="1" value={form.aiBid} onChange={set('aiBid')} placeholder="0" />
        </label>
        <label>
          Income target
          <input type="number" min="0" step="0.01" value={form.income} onChange={set('income')} placeholder="0" />
        </label>
      </div>
      <label>
        Note
        <textarea rows={2} maxLength={2000} value={form.note} onChange={set('note')} placeholder="How will you reach this?" />
      </label>

      <div className="plan-status-row">
        <span className="muted small">Result</span>
        <StatusPicker value={form.status} onChange={setStatus} />
      </div>

      <div className="composer-foot">
        {dirty && <span className="muted small">Unsaved changes</span>}
        <button className="btn primary" disabled={busy}>{busy ? 'Saving...' : plan ? 'Update plan' : 'Save plan'}</button>
      </div>
    </form>
  );
}
