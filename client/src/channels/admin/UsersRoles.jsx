import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useLiveData } from '../../useLiveData.js';
import { useToast } from '../../components/Toast.jsx';
import { timeAgo } from '../../format.js';
import { ROLE_LABELS, ROLE_PLURALS } from '../../components/RoleBadge.jsx';
import Avatar from '../../components/Avatar.jsx';
import Modal from '../../components/Modal.jsx';
import MemberActions from '../member/MemberActions.jsx';

const ROLE_HELP = {
  admin: 'Manages accounts, roles and groups',
  leader: 'Instructs everyone, sees all reports',
  boss: 'Leads one group',
  member: 'Regular team member',
};

// A boss leads the group they belong to, so making someone a boss asks
// which group — preset to their current one, if any.
function BossGroupDialog({ member, onConfirm, onClose, busy }) {
  const [groups, setGroups] = useState([]);
  const [group, setGroup] = useState(member.group?.id ?? '');

  useEffect(() => {
    api('/groups/options').then((d) => setGroups(d.groups)).catch(() => setGroups([]));
  }, []);

  const submit = (e) => { e.preventDefault(); if (group) onConfirm(group); };
  const moving = member.group && group && group !== member.group.id;

  return (
    <Modal
      title={`${member.name} — boss of which group?`}
      onClose={onClose}
      width={420}
      footer={(
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" form="boss-group-form" disabled={busy || !group}>
            {busy ? 'Saving...' : 'Make boss'}
          </button>
        </>
      )}
    >
      <form id="boss-group-form" className="form-grid" onSubmit={submit}>
        <label>
          Group
          <select value={group} onChange={(e) => setGroup(e.target.value)} required autoFocus>
            <option value="">Choose a group</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <p className="muted small modal-text">
          {moving
            ? `${member.name} moves from ${member.group.name} to this group and leads it.`
            : 'The boss belongs to this group, sees only its members, and records for them.'}
        </p>
      </form>
    </Modal>
  );
}

function RoleSelect({ member, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pickGroup, setPickGroup] = useState(false);

  const change = async (role, group) => {
    setBusy(true);
    try {
      const body = group ? { role, group } : { role };
      const { member: saved } = await api(`/members/${member.id}/role`, { method: 'PATCH', body });
      toast(role === 'boss' ? `${member.name} is now Boss of ${saved.group?.name}` : `${member.name} is now ${ROLE_LABELS[role]}`);
      setPickGroup(false);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <select
        className={`role-select role-border-${member.role}`}
        value={member.role}
        disabled={!member.permissions.changeRole || busy || member.status === 'disabled'}
        onChange={(e) => (e.target.value === 'boss' ? setPickGroup(true) : change(e.target.value))}
        aria-label={`Role for ${member.name}`}
        title={member.permissions.changeRole ? ROLE_HELP[member.role] : 'You cannot change your own role'}
      >
        {Object.entries(ROLE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      {member.role === 'boss' && (
        <div className="muted small role-of">
          {member.group ? `of ${member.group.name}` : <span className="alert-text">no group — pick one</span>}
        </div>
      )}
      {pickGroup && (
        <BossGroupDialog
          member={member}
          busy={busy}
          onConfirm={(group) => change('boss', group)}
          onClose={() => setPickGroup(false)}
        />
      )}
    </>
  );
}

// Admin only: every account with its role and status.
export default function UsersRoles() {
  const active = useLiveData('/members?group=all', ['directory:changed']);
  const disabled = useLiveData('/members?group=all&status=disabled', ['directory:changed']);
  const reload = () => { active.reload(); disabled.reload(); };
  const users = [...(active.data?.members ?? []), ...(disabled.data?.members ?? [])];
  const counts = Object.fromEntries(Object.keys(ROLE_LABELS).map((r) => [r, users.filter((u) => u.role === r && u.status === 'active').length]));

  return (
    <div className="page">
      <div className="stat-row">
        {Object.entries(ROLE_LABELS).map(([role, label]) => (
          <div key={role} className={`stat role-border-${role}`}>
            <span className="stat-value">{counts[role]}</span>
            <span className="muted small">{counts[role] === 1 ? label : ROLE_PLURALS[role]}</span>
          </div>
        ))}
      </div>
      {(active.error || disabled.error) && <div className="alert error">{active.error || disabled.error}</div>}
      <table className="table">
        <thead>
          <tr><th>User</th><th>Group</th><th>Role</th><th>Status</th><th>Last login</th><th aria-label="Actions" /></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={u.status === 'disabled' ? 'is-disabled' : ''}>
              <td data-label="User">
                <div className="cell-user">
                  <Avatar name={u.name} role={u.role} />
                  <div>
                    <div className="strong">{u.name}</div>
                    <div className="muted small">@{u.username} · {u.memberId}</div>
                  </div>
                </div>
              </td>
              <td data-label="Group">{u.group?.name ?? <span className="muted">—</span>}</td>
              <td data-label="Role"><RoleSelect member={u} onChanged={reload} /></td>
              <td data-label="Status"><span className={`status-pill ${u.status}`}>{u.status}</span></td>
              <td data-label="Last login" className="muted small">{timeAgo(u.lastLoginAt)}</td>
              <td className="cell-actions"><MemberActions member={u} onChanged={reload} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
