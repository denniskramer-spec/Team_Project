import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { timeAgo } from '../../format.js';
import Icon from '../../components/Icon.jsx';
import StatusPicker from './StatusPicker.jsx';

const toForm = (p, items) => ({
  ...Object.fromEntries(items.map((i) => [i.key, p?.[i.key] || ''])),
  note: p?.note ?? '',
  status: p?.status ?? 'not_done',
});

// Plan targets: one per measurable item of the daily report, grouped the
// same way (bids, candidates, income), plus a note and the result state.
export default function PlanForm({ title, type, period, scope = 'personal', plan, items, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(toForm(plan, items));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const shownPeriod = useRef(period);

  // Reload the form when the period or the saved plan changes. A reload for
  // the same period (a status change, a save in another tab) keeps what the
  // user is still typing and only takes the new result state.
  useEffect(() => {
    const samePeriod = shownPeriod.current === period;
    shownPeriod.current = period;
    if (samePeriod && dirtyRef.current) {
      setForm((f) => ({ ...f, status: plan?.status ?? f.status }));
      return;
    }
    setForm(toForm(plan, items));
    setDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, plan?.updatedAt, period]);

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

  const groups = [...new Set(items.map((i) => i.group))];

  return (
    <form className="card plan-form" onSubmit={save}>
      <div className="form-card-head">
        <Icon name={scope === 'group' ? 'users' : 'target'} size={16} />
        <strong>{title}</strong>
        {plan
          ? <span className="muted small">Saved · updated {timeAgo(plan.updatedAt)}</span>
          : <span className="tag missing-tag">No plan yet</span>}
      </div>

      <div className="plan-groups">
        {groups.map((g) => (
          <div key={g} className="plan-group">
            <span className="rm-section-title">{g}</span>
            <div className="plan-targets">
              {items.filter((i) => i.group === g).map((i) => (
                <label key={i.key}>
                  {i.label}
                  <input type="number" min="0" step={i.key === 'income' ? '0.01' : i.key === 'biddingHours' ? '0.5' : '1'} value={form[i.key]} onChange={set(i.key)} placeholder="0" />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <label>
        Note
        <textarea rows={2} maxLength={2000} value={form.note} onChange={set('note')} placeholder="How will you reach this?" />
      </label>

      <div className="plan-status-row">
        <span className="muted small">Result</span>
        <StatusPicker value={form.status} onChange={setStatus} />
        {dirty && <span className="muted small">Unsaved changes</span>}
        <button className="btn primary" disabled={busy}>{busy ? 'Saving...' : plan ? 'Update plan' : 'Save plan'}</button>
      </div>
    </form>
  );
}
