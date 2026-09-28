import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useToast } from '../../components/Toast.jsx';
import { todayInput } from '../../format.js';
import Modal from '../../components/Modal.jsx';

// Income record: who earned it, how much, when and where it came from, with
// the task it belongs to if there is one. Members record their own; bosses
// and the team leader can record it for the people they manage.
export default function IncomeForm({ forSelf, forOthers, onClose, onSaved }) {
  const toast = useToast();
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({ member: '', amount: '', date: todayInput(), from: '', task: '', note: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (forOthers) api('/incomes/members').then((d) => setMembers(d.members)).catch(() => setMembers([]));
    api('/tasks').then((d) => setTasks(d.tasks)).catch(() => setTasks([]));
  }, [forOthers]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  // Only the chosen person's tasks can be linked ('' = the person recording).
  const ownTasks = tasks.filter((t) => String(t.owner?.id) === String(form.member || user.id));
  const pickMember = (e) => setForm({ ...form, member: e.target.value, task: '' });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/incomes', {
        method: 'POST',
        body: { ...form, member: form.member || undefined, task: form.task || undefined },
      });
      toast('Income recorded');
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Record income"
      onClose={onClose}
      width={520}
      footer={(
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" form="income-form" disabled={busy}>
            {busy ? 'Saving...' : 'Record income'}
          </button>
        </>
      )}
    >
      <form id="income-form" className="form-grid" onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        {forOthers && (
          <label>
            Member
            <select value={form.member} onChange={pickMember} required={!forSelf}>
              <option value="">{forSelf ? 'Me' : 'Choose a member'}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}{m.group ? ` · ${m.group}` : ''}</option>
              ))}
            </select>
          </label>
        )}
        <div className="row">
          <label>
            Money
            <input type="number" min="0" step="0.01" value={form.amount} onChange={set('amount')} required autoFocus />
          </label>
          <label>
            Date
            <input type="date" value={form.date} onChange={set('date')} required />
          </label>
        </div>
        <label>
          From
          <input value={form.from} onChange={set('from')} maxLength={120} placeholder="Client, platform, ..." required />
        </label>
        {ownTasks.length > 0 && (
          <label>
            Task
            <select value={form.task} onChange={set('task')}>
              <option value="">No task</option>
              {ownTasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}
        <label>
          Note
          <textarea rows={2} maxLength={2000} value={form.note} onChange={set('note')} />
        </label>
        <p className="muted small form-note">
          Income records are history: once recorded they cannot be changed or deleted, so check the amount and date.
        </p>
      </form>
    </Modal>
  );
}
