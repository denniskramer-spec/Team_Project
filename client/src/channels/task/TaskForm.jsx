import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { toDateInput } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import StatusPicker from '../plan/StatusPicker.jsx';

const today = () => new Date().toISOString().slice(0, 10);

// Sign up a task: owner, name, period and salary (from the guide).
export default function TaskForm({ task, onClose, onSaved }) {
  const toast = useToast();
  const editing = Boolean(task);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({
    name: task?.name ?? '',
    owner: task?.owner?.id ?? '',
    startDate: toDateInput(task?.startDate) || today(),
    endDate: toDateInput(task?.endDate) || today(),
    salary: task?.salary ?? '',
    status: task?.status ?? 'not_done',
    note: task?.note ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/tasks/assignees').then((d) => setMembers(d.members)).catch(() => setMembers([]));
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...form, owner: form.owner || undefined };
      if (editing) await api(`/tasks/${task.id}`, { method: 'PATCH', body });
      else await api('/tasks', { method: 'POST', body });
      toast(editing ? 'Task updated' : 'Task signed up');
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Edit task' : 'Sign up a task'}
      onClose={onClose}
      width={520}
      footer={(
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" form="task-form" disabled={busy}>
            {busy ? 'Saving...' : editing ? 'Save task' : 'Sign up task'}
          </button>
        </>
      )}
    >
      <form id="task-form" className="form-grid" onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        <label>
          Task name
          <input value={form.name} onChange={set('name')} maxLength={120} required autoFocus />
        </label>
        <div className="row">
          <label>
            Task owner
            <select value={form.owner} onChange={set('owner')} disabled={members.length <= 1}>
              <option value="">Me</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}{m.group ? ` · ${m.group}` : ''}</option>
              ))}
            </select>
          </label>
          <label>
            Salary
            <input type="number" min="0" step="0.01" value={form.salary} onChange={set('salary')} placeholder="0" />
          </label>
        </div>
        <div className="row">
          <label>
            Start date
            <input type="date" value={form.startDate} onChange={set('startDate')} required />
          </label>
          <label>
            End date
            <input type="date" min={form.startDate} value={form.endDate} onChange={set('endDate')} required />
          </label>
        </div>
        <label>
          Note
          <textarea rows={2} maxLength={2000} value={form.note} onChange={set('note')} placeholder="Anything worth knowing" />
        </label>
        <div className="plan-status-row">
          <span className="muted small">Progress</span>
          <StatusPicker value={form.status} onChange={(status) => setForm({ ...form, status })} size="small" />
        </div>
      </form>
    </Modal>
  );
}
