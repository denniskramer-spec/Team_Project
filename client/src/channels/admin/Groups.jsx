import { useState } from 'react';
import { api } from '../../api.js';
import { useLiveData } from '../../useLiveData.js';
import { useToast } from '../../components/Toast.jsx';
import { ConfirmDialog } from '../../components/Modal.jsx';
import Icon from '../../components/Icon.jsx';

function GroupRow({ group, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const rename = async (e) => {
    e.preventDefault();
    if (name.trim() === group.name) return setEditing(false);
    setBusy(true);
    try {
      await api(`/groups/${group.id}`, { method: 'PATCH', body: { name } });
      toast(`Renamed to ${name.trim()}`);
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/groups/${group.id}`, { method: 'DELETE' });
      toast(`${group.name} was deleted`);
      onChanged();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <li className="card group-card">
      {editing ? (
        <form className="inline-form" onSubmit={rename}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} autoFocus required aria-label="Group name" />
          <button className="btn primary" disabled={busy}>Save</button>
          <button className="btn" type="button" onClick={() => { setEditing(false); setName(group.name); }}>Cancel</button>
        </form>
      ) : (
        <div className="group-head">
          <span className="group-icon"><Icon name="users" size={18} /></span>
          <div>
            <div className="strong">{group.name}</div>
            <div className="muted small">
              {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
              {' · '}
              {group.bosses.length ? `Boss: ${group.bosses.map((b) => b.name).join(', ')}` : 'No boss yet'}
            </div>
          </div>
          <div className="group-actions">
            <button className="btn small-btn" onClick={() => setEditing(true)}><Icon name="edit" size={14} /> Rename</button>
            <button
              className="btn small-btn danger-outline"
              onClick={() => setConfirmDelete(true)}
              disabled={group.memberCount > 0}
              title={group.memberCount > 0 ? 'Move its members to another group first' : 'Delete group'}
            >
              <Icon name="trash" size={14} /> Delete
            </button>
          </div>
        </div>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${group.name}?`}
          message="The group disappears from every channel. This cannot be undone."
          confirmLabel="Delete group"
          danger
          busy={busy}
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </li>
  );
}

// Admin only: create, rename and delete groups.
export default function Groups() {
  const toast = useToast();
  const { data, error, reload } = useLiveData('/groups', ['nav:changed', 'directory:changed']);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/groups', { method: 'POST', body: { name } });
      toast(`${name.trim()} was created. It now appears in every channel.`);
      setName('');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <form className="inline-form card" onSubmit={create}>
        <input
          placeholder="New group name, e.g. Group3"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          required
          aria-label="New group name"
        />
        <button className="btn primary" disabled={busy}><Icon name="plus" size={16} /> Create group</button>
      </form>
      <p className="muted small page-intro">
        To give a group a boss, set someone's role to Boss in Users &amp; roles and pick the group they lead. A boss belongs to that group and sees only it.
      </p>
      {error && <div className="alert error">{error}</div>}
      <ul className="card-list">
        {(data?.groups ?? []).map((g) => <GroupRow key={g.id} group={g} onChanged={reload} />)}
      </ul>
    </div>
  );
}
