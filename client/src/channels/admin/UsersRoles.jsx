import { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useLiveData } from '../../useLiveData.js';
import { useGroupOptions } from '../../options.js';
import { ROLE_ORDER } from '../../roles.js';
import { useToast } from '../../components/Toast.jsx';
import { timeAgo } from '../../format.js';
import { ROLE_LABELS, ROLE_PLURALS } from '../../components/RoleBadge.jsx';
import { useSort, Th } from '../../components/SortTable.jsx';
import Avatar from '../../components/Avatar.jsx';
import Modal from '../../components/Modal.jsx';
import MemberActions from '../member/MemberActions.jsx';

const COLUMNS = {
  user: (u) => u.name,
  group: (u) => u.group?.name ?? null,
  role: (u) => ROLE_ORDER.indexOf(u.role),
  status: (u) => u.status,
  lastLogin: { by: (u) => u.lastLoginAt ?? null, desc: true },
};
const EMPTY = [];

const ROLE_HELP = {
  admin: 'Manages accounts, roles and groups',
  leader: 'Everything an admin does, and instructs everyone',
  boss: 'Leads one group',
  member: 'Regular team member',
};

// A boss leads the group they belong to, so making someone a boss asks
// which group — preset to their current one, if any.
function BossGroupDialog({ member, onConfirm, onClose, busy }) {
  const { list: groups, error, loading } = useGroupOptions();
  const [group, setGroup] = useState(member.group?.id ?? '');

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
        {error && <div className="alert error">Could not load the groups: {error}</div>}
        <label>
          Group
          <select value={group} onChange={(e) => setGroup(e.target.value)} required autoFocus>
            <option value="">{loading ? 'Loading groups...' : 'Choose a group'}</option>
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

// Admins and the team leader: every account with its role and status.
export default function UsersRoles() {
  // Active and disabled accounts in one answer (admins and the leader see both).
  const { data, error, loading, reload } = useLiveData('/members?group=all&status=all', ['directory:changed']);
  // Active accounts first; the headers re-sort on demand.
  const users = useMemo(() => [...(data?.members ?? EMPTY)].sort((a, b) => (a.status === 'disabled') - (b.status === 'disabled')), [data]);
  const sorter = useSort(users, COLUMNS);
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
      {error && <div className="alert error">{error}</div>}
      {loading && !data && <div className="muted">Loading...</div>}
      {data && !users.length && <div className="empty-inline muted">No accounts yet.</div>}
      {users.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <Th sort={sorter} col="user">User</Th>
              <Th sort={sorter} col="group">Group</Th>
              <Th sort={sorter} col="role">Role</Th>
              <Th sort={sorter} col="status">Status</Th>
              <Th sort={sorter} col="lastLogin">Last login</Th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {sorter.rows.map((u) => (
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
      )}
    </div>
  );
}
