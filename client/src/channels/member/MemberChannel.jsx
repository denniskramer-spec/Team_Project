import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useSocket } from '../../socket/SocketContext.jsx';
import { useDebounced, useLiveData } from '../../useLiveData.js';
import { useToast } from '../../components/Toast.jsx';
import { formatBirthday, isBirthdayToday } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import RoleBadge from '../../components/RoleBadge.jsx';
import Icon from '../../components/Icon.jsx';
import TempPassword from '../../components/TempPassword.jsx';
import MemberForm from './MemberForm.jsx';
import MemberActions from './MemberActions.jsx';

// Section 3 for the Member channel: the directory for "All" or one group.
export default function MemberChannel({ title }) {
  const { user } = useAuth();
  const { online } = useSocket();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const selectedMember = searchParams.get('m') || '';
  const [query, setQuery] = useState('');
  const [showDisabled, setShowDisabled] = useState(false);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState(null);
  const q = useDebounced(query);

  const canAdd = ['admin', 'leader', 'boss'].includes(user.role);
  const canSeeDisabled = ['admin', 'leader'].includes(user.role);
  const params = new URLSearchParams({ group: title.key });
  if (q.trim()) params.set('q', q.trim());
  if (showDisabled) params.set('status', 'disabled');

  const { data, error, loading, reload } = useLiveData(`/members?${params}`, ['directory:changed']);
  const all = data?.members ?? [];
  // Picking a member in the tree narrows the list to that person.
  const members = selectedMember ? all.filter((m) => String(m.id) === selectedMember) : all;

  // Bosses may only add to their own group, so hide the button on other groups.
  const addHere = canAdd && (user.role !== 'boss' || title.key === 'all' || title.key === user.group?.slug);

  return (
    <div className="page">
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Search name, username or ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search members"
          />
        </div>
        {canSeeDisabled && (
          <label className="check">
            <input type="checkbox" checked={showDisabled} onChange={(e) => setShowDisabled(e.target.checked)} />
            Disabled accounts
          </label>
        )}
        <span className="muted small toolbar-count">
          {loading ? 'Loading...' : `${members.length} ${members.length === 1 ? 'member' : 'members'}`}
        </span>
        {addHere && (
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} /> Add member
          </button>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}

      {!loading && !members.length && !error && (
        <div className="empty-inline muted">
          {q ? `No members match "${q}".` : showDisabled ? 'No disabled accounts.' : 'No members here yet.'}
        </div>
      )}

      {members.length > 0 && (
        <table className="table member-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>ID</th>
              <th>Birthday</th>
              <th>Group</th>
              <th>Role</th>
              <th>Assets</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className={m.status === 'disabled' ? 'is-disabled' : ''}>
                <td data-label="Member">
                  <div className="cell-user">
                    <Avatar name={m.name} role={m.role} online={m.status === 'active' ? online.has(m.id) : undefined} />
                    <div>
                      <div className={`strong role-text-${m.role}`}>
                        {m.name} {String(m.id) === String(user.id) && <span className="muted small">(you)</span>}
                      </div>
                      <div className="muted small">@{m.username}</div>
                    </div>
                  </div>
                </td>
                <td data-label="ID"><code>{m.memberId}</code></td>
                <td data-label="Birthday">
                  {formatBirthday(m.birthday)}
                  {isBirthdayToday(m.birthday) && <span className="bday" title="Birthday today!"><Icon name="cake" size={14} /></span>}
                </td>
                <td data-label="Group">{m.group?.name ?? <span className="muted">—</span>}</td>
                <td data-label="Role"><RoleBadge role={m.role} /></td>
                <td data-label="Assets" className="assets-cell">
                  {m.assets?.length
                    ? m.assets.map((sentence, i) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <div key={i} className="asset-line" title={sentence}>{sentence}</div>
                    ))
                    : <span className="muted">—</span>}
                </td>
                <td className="cell-actions"><MemberActions member={m} onChanged={reload} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {adding && (
        <MemberForm
          defaultGroupId={title.groupId}
          onClose={() => setAdding(false)}
          onSaved={({ member, tempPassword }) => {
            setAdding(false);
            reload();
            if (tempPassword) setCreated({ username: member.username, password: tempPassword });
            else toast(`${member.name} was added`);
          }}
        />
      )}
      {created && (
        <TempPassword title="Member added" username={created.username} password={created.password} onClose={() => setCreated(null)} />
      )}
    </div>
  );
}
