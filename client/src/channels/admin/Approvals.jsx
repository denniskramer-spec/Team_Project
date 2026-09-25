import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useLiveData } from '../../useLiveData.js';
import { useToast } from '../../components/Toast.jsx';
import { formatBirthday, timeAgo } from '../../format.js';
import { ConfirmDialog } from '../../components/Modal.jsx';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';

function PendingCard({ member, groups, canAssign, onDone }) {
  const toast = useToast();
  const [group, setGroup] = useState(member.group?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);

  const act = async (action) => {
    setBusy(true);
    try {
      const body = action === 'approve' && canAssign ? { group: group || null } : undefined;
      await api(`/members/${member.id}/${action}`, { method: 'POST', body });
      toast(action === 'approve' ? `${member.name} can now log in` : `Sign-up from ${member.name} was rejected`);
      onDone();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
      setConfirmReject(false);
    }
  };

  return (
    <li className="card pending-card">
      <div className="cell-user">
        <Avatar name={member.name} role="member" size={40} />
        <div>
          <div className="strong">{member.name}</div>
          <div className="muted small">@{member.username} · signed up {timeAgo(member.createdAt)}</div>
        </div>
      </div>
      <dl className="profile small">
        <dt>Birthday</dt><dd>{formatBirthday(member.birthday)}</dd>
        <dt>Requested group</dt><dd>{member.group?.name ?? 'None'}</dd>
      </dl>
      <div className="pending-actions">
        {canAssign && (
          <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Group to assign">
            <option value="">No group</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <button className="btn" onClick={() => setConfirmReject(true)} disabled={busy}>Reject</button>
        <button className="btn success" onClick={() => act('approve')} disabled={busy}>
          <Icon name="userCheck" size={16} /> Approve
        </button>
      </div>
      {confirmReject && (
        <ConfirmDialog
          title="Reject this sign-up?"
          message={`The account request from ${member.name} (@${member.username}) will be deleted. They can sign up again later.`}
          confirmLabel="Reject"
          danger
          busy={busy}
          onConfirm={() => act('reject')}
          onClose={() => setConfirmReject(false)}
        />
      )}
    </li>
  );
}

export default function Approvals() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useLiveData('/members/pending', ['nav:changed']);
  const [groups, setGroups] = useState([]);
  const canAssign = ['admin', 'leader'].includes(user.role);

  useEffect(() => {
    if (canAssign) api('/groups/options').then((d) => setGroups(d.groups)).catch(() => {});
  }, [canAssign]);

  const pending = data?.members ?? [];

  return (
    <div className="page">
      <p className="muted page-intro">
        {user.role === 'boss'
          ? 'People who signed up for your group. Approve them so they can log in.'
          : 'People who signed up and are waiting for access. You can change their group before approving.'}
      </p>
      {error && <div className="alert error">{error}</div>}
      {!loading && !pending.length && !error && (
        <div className="empty-inline muted"><Icon name="userCheck" size={20} /> No sign-ups waiting for approval.</div>
      )}
      <ul className="card-list">
        {pending.map((m) => (
          <PendingCard key={m.id} member={m} groups={groups} canAssign={canAssign} onDone={reload} />
        ))}
      </ul>
    </div>
  );
}
