import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useSocket } from '../../socket/SocketContext.jsx';
import { useDebounced, useLiveData } from '../../useLiveData.js';
import { useToast } from '../../components/Toast.jsx';
import { isBirthdayToday } from '../../format.js';
import DateTag from '../../components/DateTag.jsx';
import ResidentDetails from '../resident/ResidentDetails.jsx';
import Avatar from '../../components/Avatar.jsx';
import RoleBadge from '../../components/RoleBadge.jsx';
import Icon from '../../components/Icon.jsx';
import { useSort, Th } from '../../components/SortTable.jsx';
import { ROLE_ORDER, isManager } from '../../roles.js';
import TempPassword from '../../components/TempPassword.jsx';
import MemberForm from './MemberForm.jsx';
import MemberActions from './MemberActions.jsx';

// Section 3 for the Member channel: the directory for "All" or one group.
const COLUMNS = {
  member: (m) => m.name,
  id: (m) => m.memberId,
  birthday: (m) => m.birthday ?? null,
  group: (m) => m.group?.name ?? null,
  role: (m) => ROLE_ORDER.indexOf(m.role),
  residents: { by: (m) => m.residents?.length ?? 0, desc: true },
};

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
  // Which member's residents are open in the dialog, and which one it starts on.
  const [viewing, setViewing] = useState(null);
  const q = useDebounced(query);

  const canAdd = isManager(user) || user.role === 'boss';
  const canSeeDisabled = isManager(user);
  const params = new URLSearchParams({ group: title.key });
  if (q.trim()) params.set('q', q.trim());
  if (showDisabled) params.set('status', 'disabled');

  const { data, error, loading, reload } = useLiveData(`/members?${params}`, ['directory:changed', 'resident:changed']);
  const all = useMemo(() => data?.members ?? [], [data]);
  // Picking a member in the tree narrows the list to that person.
  const members = useMemo(() => (selectedMember ? all.filter((m) => String(m.id) === selectedMember) : all), [all, selectedMember]);
  const sorter = useSort(members, COLUMNS);

  // Bosses may only add to their own group, so hide the button on other groups.
  // The dialog reads the live list, so an edit shows up without reopening it.
  const viewingMember = viewing && all.find((m) => String(m.id) === String(viewing.memberId) && m.residents?.length);

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
              <Th sort={sorter} col="member">Member</Th>
              <Th sort={sorter} col="id">ID</Th>
              <Th sort={sorter} col="birthday">Birthday</Th>
              <Th sort={sorter} col="group">Group</Th>
              <Th sort={sorter} col="role">Role</Th>
              <Th sort={sorter} col="residents">Residents</Th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {sorter.rows.map((m) => (
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
                  <DateTag value={m.birthday} utc icon="cake" />
                  {isBirthdayToday(m.birthday) && <span className="bday" title="Birthday today!"><Icon name="cake" size={14} /></span>}
                </td>
                <td data-label="Group">{m.group?.name ?? <span className="muted">—</span>}</td>
                <td data-label="Role"><RoleBadge role={m.role} /></td>
                <td data-label="Residents" className="residents-cell">
                  {m.residents?.length
                    ? (
                      <div className="asset-chips">
                        {m.residents.map((r, i) => (
                          <button key={r.id} type="button" className="asset-chip" title={r.sentence} onClick={() => setViewing({ memberId: m.id, index: i })}>
                            <Icon name="userPlus" size={13} />
                            {r.name}
                          </button>
                        ))}
                      </div>
                    )
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
      {viewingMember && (
        <ResidentDetails
          member={viewingMember}
          residents={viewingMember.residents}
          initialIndex={viewing.index}
          onClose={() => setViewing(null)}
          onChanged={reload}
        />
      )}
      {created && (
        <TempPassword title="Member added" username={created.username} password={created.password} onClose={() => setCreated(null)} />
      )}
    </div>
  );
}
