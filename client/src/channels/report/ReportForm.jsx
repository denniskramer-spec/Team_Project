import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { timeAgo, toDateInput } from '../../format.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import Icon from '../../components/Icon.jsx';

const EMPTY = { task: '', jobBid: '', aiBid: '', income: '', upcomingAmount: '', upcomingDate: '', upcomingNote: '', note: '' };
const toForm = (r) => (r
  ? {
    task: r.task?.id ?? '',
    jobBid: r.jobBid ?? '',
    aiBid: r.aiBid ?? '',
    income: r.income ?? '',
    upcomingAmount: r.upcomingAmount ?? '',
    upcomingDate: toDateInput(r.upcomingDate),
    upcomingNote: r.upcomingNote ?? '',
    note: r.note ?? '',
  }
  : { ...EMPTY });

// The report form: bids, income, what is coming next (amount + note) and a note.
export default function ReportForm({ title, type, period, scope = 'personal', report, onSaved }) {
  const toast = useToast();
  const { user } = useAuth();
  const [form, setForm] = useState(toForm(report));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tasks, setTasks] = useState([]);

  // A personal report can name the task it is about; only the author's own tasks.
  useEffect(() => {
    if (scope !== 'personal') return;
    api('/tasks').then((d) => setTasks(d.tasks.filter((t) => String(t.owner?.id) === String(user.id)))).catch(() => setTasks([]));
  }, [scope, user.id]);

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const shownPeriod = useRef(period);

  // Reload the form when the period or the saved report changes, except that
  // a save from another tab for the same period doesn't wipe unsaved typing.
  useEffect(() => {
    const samePeriod = shownPeriod.current === period;
    shownPeriod.current = period;
    if (samePeriod && dirtyRef.current) return;
    setForm(toForm(report));
    setDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id, report?.updatedAt, period]);

  const set = (key) => (e) => { setForm({ ...form, [key]: e.target.value }); setDirty(true); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/reports', { method: 'PUT', body: { ...form, type, period, scope } });
      toast(report ? 'Report updated' : 'Report submitted');
      setDirty(false);
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card report-form" onSubmit={submit}>
      <div className="report-form-head">
        <Icon name={scope === 'group' ? 'users' : 'clipboard'} size={16} />
        <strong>{title}</strong>
        {report
          ? <span className="muted small">Submitted · updated {timeAgo(report.updatedAt)}</span>
          : <span className="tag missing-tag">Not submitted</span>}
      </div>

      {scope === 'personal' && tasks.length > 0 && (
        <label>
          Task
          <select value={form.task} onChange={set('task')}>
            <option value="">Not about a task</option>
            {tasks.map((t) => <option key={t.id} value={t.id}>{t.name}{t.status === 'done' ? ' · done' : ''}</option>)}
          </select>
        </label>
      )}
      <div className="number-grid">
        <label>
          Job bids
          <input type="number" min="0" step="1" value={form.jobBid} onChange={set('jobBid')} placeholder="0" />
        </label>
        <label>
          AI training bids
          <input type="number" min="0" step="1" value={form.aiBid} onChange={set('aiBid')} placeholder="0" />
        </label>
        <label>
          Income
          <input type="number" min="0" step="0.01" value={form.income} onChange={set('income')} placeholder="0" />
        </label>
        <label>
          Upcoming amount
          <input type="number" min="0" step="0.01" value={form.upcomingAmount} onChange={set('upcomingAmount')} placeholder="0" />
        </label>
        <label>
          Upcoming date
          <input type="date" value={form.upcomingDate} onChange={set('upcomingDate')} />
        </label>
      </div>
      <label>
        Upcoming note
        <textarea rows={2} maxLength={2000} value={form.upcomingNote} onChange={set('upcomingNote')} placeholder="What is coming next, and from where?" />
      </label>
      <label>
        Note
        <textarea rows={2} maxLength={2000} value={form.note} onChange={set('note')} placeholder="Anything else worth knowing" />
      </label>

      <div className="composer-foot">
        {dirty && <span className="muted small">Unsaved changes</span>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving...' : report ? 'Update report' : 'Submit report'}
        </button>
      </div>
    </form>
  );
}
