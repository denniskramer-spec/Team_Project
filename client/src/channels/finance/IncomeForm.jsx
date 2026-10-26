import { useEffect, useState } from 'react';
import { api, upload } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useToast } from '../../components/Toast.jsx';
import { todayInput, formatAmount, timeAgo } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import ImageDrop from '../../components/ImageDrop.jsx';

// Income record: who earned it, how much, when and where it came from, with
// the task it belongs to if there is one. Members record their own; bosses
// and the team leader can record it for the people they manage.
export default function IncomeForm({ forSelf, forOthers, onClose, onSaved }) {
  const toast = useToast();
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [residents, setResidents] = useState([]);
  const [methods, setMethods] = useState([]);
  const [form, setForm] = useState({
    member: '', amount: '', date: todayInput(), task: '', note: '',
    resident: '', residentPercent: '', method: 'paypal', feePercent: '', feeFixed: '',
  });
  // Screenshots already uploaded (kept across a failed save) and new files.
  const [kept, setKept] = useState([]);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (forOthers) api('/incomes/members').then((d) => setMembers(d.members)).catch(() => setMembers([]));
    api('/tasks').then((d) => setTasks(d.tasks)).catch(() => setTasks([]));
    api('/residents').then((d) => setResidents(d.residents)).catch(() => setResidents([]));
    api('/incomes/methods').then((d) => {
      setMethods(d.methods);
      const m = d.methods.find((x) => x.key === 'paypal') ?? d.methods[0];
      if (m) setForm((f) => ({ ...f, method: m.key, feePercent: m.feePercent, feeFixed: m.feeFixed }));
    }).catch(() => setMethods([]));
  }, [forOthers]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  // Only the chosen person's projects and residents can be linked ('' = the person recording).
  const ownerId = String(form.member || user.id);
  const ownTasks = tasks.filter((t) => String(t.owner?.id) === ownerId);
  const ownResidents = residents.filter((r) => String(r.owner?.id) === ownerId);
  const pickMember = (e) => setForm({ ...form, member: e.target.value, task: '', resident: '', residentPercent: '' });
  // Picking a resident brings their divide %; picking a project brings its resident.
  const pickResident = (id) => {
    const r = ownResidents.find((x) => String(x.id) === String(id));
    setForm((f) => ({ ...f, resident: id, residentPercent: r ? (r.sharePercent || '') : '' }));
  };
  // Picking a project brings its resident and its payment method (with the usual fee).
  const pickTask = (e) => {
    const t = ownTasks.find((x) => String(x.id) === e.target.value);
    setForm((f) => ({ ...f, task: e.target.value }));
    if (t?.resident?.id) pickResident(String(t.resident.id));
    const m = t?.method ? methods.find((x) => x.key === t.method) : null;
    if (m) setForm((f) => ({ ...f, method: m.key, feePercent: m.feePercent, feeFixed: m.feeFixed }));
  };
  const pickMethod = (e) => {
    const m = methods.find((x) => x.key === e.target.value);
    setForm((f) => ({ ...f, method: e.target.value, feePercent: m?.feePercent ?? 0, feeFixed: m?.feeFixed ?? 0 }));
  };

  const method = methods.find((x) => x.key === form.method);
  const feeText = method
    ? `${method.feePercent ? `${method.feePercent}%` : ''}${method.feePercent && method.feeFixed ? ' + ' : ''}${method.feeFixed ? formatAmount(method.feeFixed) : ''}${!method.feePercent && !method.feeFixed ? 'free' : ''}`
    : '—';

  // The split, as the server will work it out: fee first, then the resident's share.
  const gross = Number(form.amount) || 0;
  const feeAmount = Math.min(gross, gross * ((Number(form.feePercent) || 0) / 100) + (Number(form.feeFixed) || 0));
  const residentAmount = (gross - feeAmount) * ((Number(form.residentPercent) || 0) / 100);
  const net = gross - feeAmount - residentAmount;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let attached = kept;
      if (files.length) {
        const fd = new FormData();
        files.forEach((f) => fd.append('images', f));
        const uploaded = await upload('/incomes/upload', fd);
        attached = [...kept, ...uploaded.images.map((i) => ({ ...i, url: `/api/files/${i.file}` }))];
        setKept(attached);
        setFiles([]);
      }
      const images = attached.map(({ file, name, type, size }) => ({ file, name, type, size }));
      await api('/incomes', {
        method: 'POST',
        body: { ...form, member: form.member || undefined, task: form.task || undefined, resident: form.resident || undefined, images },
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
        <div className="row">
          <label>
            Project
            <select value={form.task} onChange={pickTask}>
              <option value="">No project</option>
              {ownTasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label>
            Resident
            <select value={form.resident} onChange={(e) => pickResident(e.target.value)}>
              <option value="">None</option>
              {ownResidents.map((r) => <option key={r.id} value={r.id}>{r.name}{r.sharePercent ? ` · ${r.sharePercent}%` : ''}</option>)}
            </select>
          </label>
        </div>
        <div className="row fee-row">
          <label>
            Payment method
            <select value={form.method} onChange={pickMethod}>
              {methods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
          <div className="toggle-field">
            <span className="field-label">Fee</span>
            <div className="fee-shown" title={method?.detail || ''}>
              <strong>{feeText}</strong>
              <span className="muted small">{method?.auto ? `auto · checked ${method.checkedAt ? timeAgo(method.checkedAt) : 'never'}` : 'published rate'}</span>
            </div>
          </div>
        </div>
        <div className="split-preview">
          <div><span className="muted small">Fee</span><strong>−{formatAmount(feeAmount)}</strong></div>
          <div>
            <span className="muted small">Resident share</span>
            <span className="split-share">
              <input type="number" min="0" max="100" step="0.5" value={form.residentPercent} onChange={set('residentPercent')} placeholder="0" aria-label="Resident share %" />
              <span className="muted">%</span>
              <strong>−{formatAmount(residentAmount)}</strong>
            </span>
          </div>
          <div className="split-net"><span className="muted small">Net to you</span><strong>{formatAmount(net)}</strong></div>
        </div>
        <label>
          Note
          <textarea rows={2} maxLength={2000} value={form.note} onChange={set('note')} />
        </label>
        <div className="target-pick">
          <span className="field-label">Screenshots <span className="muted form-help">optional</span></span>
          <ImageDrop
            existing={kept}
            onRemoveExisting={(img) => setKept(kept.filter((k) => k.file !== img.file))}
            files={files}
            onFiles={setFiles}
          />
        </div>
        <p className="muted small form-note">
          Income records are history: once recorded they cannot be changed or deleted, so check the amount and date.
        </p>
      </form>
    </Modal>
  );
}
