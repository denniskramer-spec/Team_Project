import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useToast } from '../../components/Toast.jsx';
import { toDateInput, todayInput as today } from '../../format.js';
import Modal, { ConfirmDialog } from '../../components/Modal.jsx';
import { STATUSES } from './ProjectStatus.jsx';

const UNITS = [
  { key: 'hour', label: 'Per hour' }, { key: 'task', label: 'Per task' }, { key: 'day', label: 'Per day' }, { key: 'week', label: 'Per week' },
  { key: 'month', label: 'Per month' }, { key: 'fixed', label: 'Fixed' },
];

// Register or edit a project: title, source, the resident it is for, price,
// dates, status and notes.
export default function TaskForm({ task, options, onClose, onSaved }) {
  const toast = useToast();
  const { user } = useAuth();
  // Projects belong to members and bosses; the leader and admins pick one.
  const canOwn = ['member', 'boss'].includes(user.role);
  const editing = Boolean(task);
  const [members, setMembers] = useState([]);
  const [residents, setResidents] = useState([]);
  const [form, setForm] = useState({
    name: task?.name ?? '',
    source: task?.source ?? '',
    resident: task?.resident?.id ?? '',
    owner: task?.owner?.id ?? '',
    price: task?.price ?? '',
    currency: task?.currency ?? 'USD',
    priceUnit: task?.priceUnit ?? 'hour',
    method: task?.method ?? '',
    startDate: toDateInput(task?.startDate) || today(),
    endDate: toDateInput(task?.endDate),
    status: task?.status ?? 'active',
    note: task?.note ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    api('/tasks/assignees').then((d) => setMembers(d.members)).catch(() => setMembers([]));
    api('/tasks/residents').then((d) => setResidents(d.residents)).catch(() => setResidents([]));
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...form, owner: form.owner || undefined, resident: form.resident || null, endDate: form.endDate || null };
      if (editing) await api(`/tasks/${task.id}`, { method: 'PATCH', body });
      else await api('/tasks', { method: 'POST', body });
      toast(editing ? 'Project updated' : 'Project added');
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/tasks/${task.id}`, { method: 'DELETE' });
      toast('Project deleted');
      onSaved();
    } catch (err) {
      setConfirm(false);
      setError(err.message);
      setBusy(false);
    }
  };

  const currencies = options?.currencies ?? ['USD', 'EUR', 'GBP'];
  const methods = options?.methods ?? [];

  return (
    <Modal
      title={editing ? `Edit ${task.name}` : 'Register a project'}
      onClose={onClose}
      width={560}
      footer={(
        <>
          {editing && task.canEdit && (
            <button className="btn danger" type="button" onClick={() => setConfirm(true)} disabled={busy}>Delete</button>
          )}
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" form="task-form" disabled={busy}>
            {busy ? 'Saving...' : editing ? 'Save changes' : 'Add project'}
          </button>
        </>
      )}
    >
      <form id="task-form" className="form-grid" onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        <label>
          Project title
          <input value={form.name} onChange={set('name')} maxLength={120} placeholder="e.g. React dashboard for a logistics startup" required autoFocus />
        </label>
        <div className="row">
          <label>
            Source
            <input value={form.source} onChange={set('source')} maxLength={120} placeholder="Upwork, LinkedIn, referral..." />
            <span className="form-help">Where the project came from</span>
          </label>
          <label>
            Profile / Resident
            <select value={form.resident} onChange={set('resident')}>
              <option value="">None</option>
              {residents.map((r) => <option key={r.id} value={r.id}>{r.name}{r.owner && !canOwn ? ` · ${r.owner}` : ''}</option>)}
            </select>
            <span className="form-help">The persona or resident it's for</span>
          </label>
        </div>
        <div className="price-row">
          <label>
            Price
            <input type="number" min="0" step="0.01" value={form.price} onChange={set('price')} placeholder="30" />
          </label>
          <label>
            <span className="sr-only">Currency</span>
            <select value={form.currency} onChange={set('currency')} aria-label="Currency">
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Price unit</span>
            <select value={form.priceUnit} onChange={set('priceUnit')} aria-label="Price unit">
              {UNITS.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
            </select>
          </label>
          <span className="form-help price-help">Hourly, per task, monthly, fixed — whatever the deal is</span>
        </div>
        <label>
          Payment method
          <select value={form.method} onChange={set('method')}>
            <option value="">Not decided yet</option>
            {methods.map((m) => <option key={m.key} value={m.key}>{m.label}{m.feePercent || m.feeFixed ? ` · fee ${m.feePercent ? `${m.feePercent}%` : ''}${m.feePercent && m.feeFixed ? ' + ' : ''}${m.feeFixed ? m.feeFixed : ''}` : ''}</option>)}
          </select>
          <span className="form-help">How this project pays you; income records start from it</span>
        </label>
        <div className="row">
          <label>
            Started
            <input type="date" value={form.startDate} onChange={set('startDate')} required />
            <span className="form-help">The day work on it began</span>
          </label>
          <label>
            Project expires
            <input type="date" min={form.startDate} value={form.endDate} onChange={set('endDate')} />
            <span className="form-help">Leave empty if it's open-ended</span>
          </label>
        </div>
        <div className="row">
          <label>
            Status
            <select value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          {(!canOwn || members.length > 1) && (
            <label>
              Belongs to
              <select value={form.owner} onChange={set('owner')} required={!canOwn}>
                <option value="">{canOwn ? 'Me' : 'Choose a member'}</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.group ? ` · ${m.group}` : ''}</option>)}
              </select>
            </label>
          )}
        </div>
        <label>
          Notes
          <textarea rows={3} maxLength={2000} value={form.note} onChange={set('note')} />
          <span className="form-help">Optional — client, scope, anything worth knowing</span>
        </label>
      </form>
      {confirm && (
        <ConfirmDialog
          title={`Delete "${task.name}"?`}
          message="The project is removed. Work written about it in daily reports and income already recorded are kept."
          confirmLabel="Delete project"
          danger
          busy={busy}
          onConfirm={remove}
          onClose={() => setConfirm(false)}
        />
      )}
    </Modal>
  );
}
