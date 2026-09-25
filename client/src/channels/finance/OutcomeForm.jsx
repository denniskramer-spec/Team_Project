import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { toDateInput } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import TargetFields, { targetFrom, targetBody } from './OutcomeTarget.jsx';

// One-off outcome record: who it is for, how much, when, the reason and a
// comment. Only the team leader and bosses open this form.
export default function OutcomeForm({ outcome, groups, wholeTeam, onClose, onSaved }) {
  const toast = useToast();
  const editing = Boolean(outcome);
  const [members, setMembers] = useState([]);
  const [target, setTarget] = useState(targetFrom(outcome));
  const [form, setForm] = useState({
    amount: outcome?.amount ?? '',
    date: toDateInput(outcome?.date) || new Date().toISOString().slice(0, 10),
    reason: outcome?.reason ?? '',
    comment: outcome?.comment ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/outcomes/members').then((d) => setMembers(d.members)).catch(() => setMembers([]));
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...form, ...targetBody(target) };
      if (editing) await api(`/outcomes/${outcome.id}`, { method: 'PATCH', body });
      else await api('/outcomes', { method: 'POST', body });
      toast(editing ? 'Outcome updated' : 'Outcome recorded');
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Edit outcome' : 'Record outcome'}
      onClose={onClose}
      width={480}
      footer={(
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" form="outcome-form" disabled={busy}>
            {busy ? 'Saving...' : editing ? 'Save' : 'Record outcome'}
          </button>
        </>
      )}
    >
      <form id="outcome-form" className="form-grid" onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        <TargetFields value={target} onChange={setTarget} members={members} groups={groups} wholeTeam={wholeTeam} />
        <div className="row">
          <label>
            Money
            <input type="number" min="0" step="0.01" value={form.amount} onChange={set('amount')} required />
          </label>
          <label>
            Date
            <input type="date" value={form.date} onChange={set('date')} required />
          </label>
        </div>
        <label>
          Reason
          <input value={form.reason} onChange={set('reason')} maxLength={120} placeholder="Equipment, travel, licence, ..." required />
        </label>
        <label>
          Comment
          <textarea rows={3} maxLength={2000} value={form.comment} onChange={set('comment')} />
        </label>
      </form>
    </Modal>
  );
}
