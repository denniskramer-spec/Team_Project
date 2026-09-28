import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { toDateInput, todayInput } from '../../format.js';
import { ROLE_LABELS } from '../../components/RoleBadge.jsx';
import Modal from '../../components/Modal.jsx';

// Add a new member, or edit an existing one (`member` given).
// Which fields are editable follows the permissions the server sent.
export default function MemberForm({ member, defaultGroupId, onClose, onSaved }) {
  const { user } = useAuth();
  const editing = Boolean(member);
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState({
    name: member?.name ?? '',
    username: member?.username ?? '',
    birthday: toDateInput(member?.birthday),
    group: member?.group?.id ?? (user.role === 'boss' ? user.group?.id : defaultGroupId) ?? '',
    role: member?.role ?? 'member',
    password: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/groups/options').then((d) => setGroups(d.groups)).catch(() => {});
  }, []);

  const canPickGroup = editing ? member.permissions.changeGroup : ['admin', 'leader'].includes(user.role);
  const canPickRole = !editing && user.role === 'admin';
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let result;
      if (editing) {
        const body = { name: form.name, birthday: form.birthday || null };
        if (canPickGroup) body.group = form.group || null;
        result = await api(`/members/${member.id}`, { method: 'PATCH', body });
      } else {
        const body = { name: form.name, username: form.username, birthday: form.birthday || null };
        if (canPickGroup) body.group = form.group || null;
        if (canPickRole) body.role = form.role;
        if (form.password) body.password = form.password;
        result = await api('/members', { method: 'POST', body });
      }
      onSaved(result);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const today = todayInput();

  return (
    <Modal
      title={editing ? `Edit ${member.name}` : 'Add member'}
      onClose={onClose}
      footer={(
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" form="member-form" disabled={busy}>
            {busy ? 'Saving...' : editing ? 'Save changes' : 'Add member'}
          </button>
        </>
      )}
    >
      <form id="member-form" className="form-grid" onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        <label>
          Full name
          <input value={form.name} onChange={set('name')} maxLength={60} required />
        </label>
        {!editing && (
          <label>
            Username
            <input
              value={form.username}
              onChange={set('username')}
              pattern="[A-Za-z0-9_.]{3,30}"
              title="3-30 characters: letters, numbers, _ or ."
              required
            />
          </label>
        )}
        <div className="row">
          <label>
            Birthday
            <input type="date" max={today} value={form.birthday} onChange={set('birthday')} />
          </label>
          <label>
            {form.role === 'boss' ? 'Boss of group' : 'Group'}
            <select value={form.group} onChange={set('group')} disabled={!canPickGroup} required={form.role === 'boss'}>
              <option value="">{form.role === 'boss' ? 'Choose a group' : 'No group'}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        </div>
        {canPickRole && (
          <label>
            Role
            <select value={form.role} onChange={set('role')}>
              {Object.entries(ROLE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
        )}
        {!editing && (
          <label>
            Temporary password
            <input
              type="text"
              value={form.password}
              onChange={set('password')}
              placeholder="Leave empty to generate one"
              autoComplete="off"
            />
          </label>
        )}
        {!editing && (
          <p className="muted small form-note">
            The new member can log in straight away and must choose their own password at first login.
          </p>
        )}
      </form>
    </Modal>
  );
}
