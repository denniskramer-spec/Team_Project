import { useState } from 'react';
import { api } from '../../api.js';
import { useLiveData } from '../../useLiveData.js';
import { useGroupOptions } from '../../options.js';
import { useToast } from '../../components/Toast.jsx';
import { timeAgo } from '../../format.js';
import { ConfirmDialog } from '../../components/Modal.jsx';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import DateTag from '../../components/DateTag.jsx';

function PendingCard({ member, groups, onDone }) {
  const toast = useToast();
  const [group, setGroup] = useState(member.group?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  // A sign-up has no group; one from before that change may still carry the
  // group it asked for, listed even when the groups could not be loaded.
  const requested = member.group && !groups.some((g) => String(g.id) === String(member.group.id)) ? member.group : null;

  const act = async (action) => {
    setBusy(true);
    try {
      const body = action === 'approve' ? { group: group || null } : undefined;
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
        <Avatar name={member.username} role="member" size={40} />
        <div>
          <div className="strong">{member.name}</div>
          <div className="muted small">@{member.username} · signed up {timeAgo(member.createdAt)}</div>
        </div>
      </div>
      <dl className="profile small">
        <dt>Birthday</dt><dd><DateTag value={member.birthday} utc muted={false} icon="cake" /></dd>
      </dl>
      <div className="pending-actions">
        <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Group to assign">
          <option value="">No group</option>
          {requested && <option value={requested.id}>{requested.name}</option>}
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
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
  const { data, error, loading, reload } = useLiveData('/members/pending', ['nav:changed']);
  const { list: groups, error: groupsError } = useGroupOptions();

  const pending = data?.members ?? [];

  return (
    <div className="page">
      <p className="muted page-intro">
        People who signed up and are waiting for access. Choose their group as you approve them.
      </p>
      {error && <div className="alert error">{error}</div>}
      {groupsError && <div className="alert error">Could not load the groups: {groupsError}</div>}
      {!loading && !pending.length && !error && (
        <div className="empty-inline muted"><Icon name="userCheck" size={20} /> No sign-ups waiting for approval.</div>
      )}
      <ul className="card-list">
        {pending.map((m) => (
          <PendingCard key={m.id} member={m} groups={groups} onDone={reload} />
        ))}
      </ul>
    </div>
  );
}
