import { useEffect, useState } from 'react';
import { api, upload } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { formatAmount, toDateInput } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import ImageDrop from '../../components/ImageDrop.jsx';
import TargetFields, { targetFrom, targetBody } from './OutcomeTarget.jsx';

// Outcome record: who it is for, how much, when, the reason, a comment and
// screenshots. Only the team leader and bosses open this form. Editing a
// shared (split) outcome changes every member's share at once.
export default function OutcomeForm({ outcome, groups, wholeTeam, onClose, onSaved }) {
  const toast = useToast();
  const editing = Boolean(outcome);
  const split = outcome?.split ?? null;
  const [members, setMembers] = useState([]);
  const [target, setTarget] = useState(targetFrom(outcome));
  const [form, setForm] = useState({
    amount: split ? split.total : outcome?.amount ?? '',
    date: toDateInput(outcome?.date) || new Date().toISOString().slice(0, 10),
    reason: outcome?.reason ?? '',
    comment: outcome?.comment ?? '',
  });
  const [kept, setKept] = useState(outcome?.images ?? []);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/outcomes/members').then((d) => setMembers(d.members)).catch(() => setMembers([]));
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const hasImage = kept.length + files.length > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!hasImage) { setError('Attach at least one image (a screenshot or receipt)'); return; }
    setBusy(true);
    setError('');
    try {
      let attached = kept;
      if (files.length) {
        const fd = new FormData();
        files.forEach((f) => fd.append('images', f));
        const uploaded = await upload('/outcomes/upload', fd);
        // Treat them as already attached from now on, so a retry after a
        // failed save does not upload the same images again.
        attached = [...kept, ...uploaded.images.map((i) => ({ ...i, url: `/api/files/${i.file}` }))];
        setKept(attached);
        setFiles([]);
      }
      const images = attached.map(({ file, name, type, size }) => ({ file, name, type, size }));
      const body = { ...form, images, ...(split ? {} : targetBody(target)) };
      const result = editing
        ? await api(`/outcomes/${outcome.id}`, { method: 'PATCH', body })
        : await api('/outcomes', { method: 'POST', body });
      const n = result.outcomes.length;
      if (editing) toast(n > 1 ? `Outcome updated for ${n} members` : 'Outcome updated');
      else toast(n > 1 ? `Outcome split over ${n} members · ${formatAmount(result.outcomes[0].amount)} each` : 'Outcome recorded');
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={editing ? (split ? `Edit shared outcome · ${split.label}` : 'Edit outcome') : 'Record outcome'}
      onClose={onClose}
      width={520}
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
        {split ? (
          <p className="muted small form-note">
            Shared by {split.count} people. The amount below is the total; it is split equally again when you save.
            To change who shares it, delete this outcome and record it again.
          </p>
        ) : (
          <TargetFields value={target} onChange={setTarget} members={members} groups={groups} wholeTeam={wholeTeam} />
        )}
        <div className="row">
          <label>
            {target.team || split ? 'Total money' : 'Money'}
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
        <div className="target-pick">
          <span className="field-label">Images <span className="required-mark" aria-hidden="true">*</span> <span className="muted">required</span></span>
          <ImageDrop
            existing={kept}
            onRemoveExisting={(img) => setKept(kept.filter((k) => k.file !== img.file))}
            files={files}
            onFiles={setFiles}
            invalid={!hasImage && Boolean(error)}
          />
        </div>
      </form>
    </Modal>
  );
}
