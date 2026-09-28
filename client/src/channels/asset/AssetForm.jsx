import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useToast } from '../../components/Toast.jsx';
import { toDateInput, todayInput } from '../../format.js';
import Modal from '../../components/Modal.jsx';

const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Fluent', 'Native'];

// Create or edit an asset: name, birthday, nationality, contact and English level.
export default function AssetForm({ asset, defaultOwner, onClose, onSaved }) {
  const toast = useToast();
  const { user } = useAuth();
  // Assets belong to members and bosses; the leader and admins pick one.
  const canOwn = ['member', 'boss'].includes(user.role);
  const editing = Boolean(asset);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({
    name: asset?.name ?? '',
    birthday: toDateInput(asset?.birthday),
    nationality: asset?.nationality ?? '',
    contact: asset?.contact ?? '',
    englishLevel: asset?.englishLevel ?? 'Intermediate',
    owner: asset?.owner?.id ?? defaultOwner ?? '',
    note: asset?.note ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/assets/owners').then((d) => setMembers(d.members)).catch(() => setMembers([]));
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...form, owner: form.owner || undefined, birthday: form.birthday || null };
      if (editing) await api(`/assets/${asset.id}`, { method: 'PATCH', body });
      else await api('/assets', { method: 'POST', body });
      toast(editing ? 'Asset updated' : 'Asset created');
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={editing ? `Edit ${asset.name}` : 'New asset'}
      onClose={onClose}
      width={520}
      footer={(
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" form="asset-form" disabled={busy}>
            {busy ? 'Saving...' : editing ? 'Save asset' : 'Create asset'}
          </button>
        </>
      )}
    >
      <form id="asset-form" className="form-grid" onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        <label>
          Name
          <input value={form.name} onChange={set('name')} maxLength={80} required autoFocus />
        </label>
        <div className="row">
          <label>
            Birthday
            <input type="date" max={todayInput()} value={form.birthday} onChange={set('birthday')} />
          </label>
          <label>
            Nationality
            <input value={form.nationality} onChange={set('nationality')} maxLength={60} placeholder="e.g. Brazilian" />
          </label>
        </div>
        <div className="row">
          <label>
            English level
            <select value={form.englishLevel} onChange={set('englishLevel')}>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label>
            Belongs to
            <select value={form.owner} onChange={set('owner')} disabled={canOwn && members.length <= 1} required={!canOwn}>
              <option value="">{canOwn ? 'Me' : 'Choose a member'}</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.group ? ` · ${m.group}` : ''}</option>)}
            </select>
          </label>
        </div>
        <label>
          Contact info
          <input value={form.contact} onChange={set('contact')} maxLength={160} placeholder="Email, phone or handle" />
        </label>
        <label>
          Note
          <textarea rows={2} maxLength={2000} value={form.note} onChange={set('note')} />
        </label>
      </form>
    </Modal>
  );
}
