import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSocket } from '../socket/SocketContext.jsx';
import { ROLE_LABELS } from '../components/RoleBadge.jsx';
import Avatar from '../components/Avatar.jsx';
import Modal from '../components/Modal.jsx';

// The path of a direct message with someone. The person travels in the
// navigation state, so the conversation has a name before its first message
// puts it in the nav.
export const dmPath = (peer) => ({
  to: `/chat/dm-${peer.id}`,
  state: { peer: { id: String(peer.id), name: peer.name, role: peer.role, group: peer.group?.name ?? peer.group ?? null } },
});

// "+" next to Direct messages: pick a person from the directory to write to.
export default function NewDm({ onClose }) {
  const { user } = useAuth();
  const { online } = useSocket();
  const navigate = useNavigate();
  const [people, setPeople] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    api('/users/directory')
      .then((d) => setPeople(d.users.filter((u) => String(u.id) !== String(user.id))))
      .catch((err) => setError(err.message));
  }, [user.id]);

  const needle = q.trim().toLowerCase();
  const shown = (people ?? []).filter((p) => !needle || `${p.name} ${p.username} ${p.group?.name ?? ''}`.toLowerCase().includes(needle));

  const pick = (p) => {
    const { to, state } = dmPath(p);
    onClose();
    navigate(to, { state });
  };

  return (
    <Modal title="New direct message" onClose={onClose} width={400}>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find someone"
        aria-label="Find someone"
        autoFocus
      />
      {error && <div className="alert error">{error}</div>}
      {people && !shown.length && <p className="muted small">Nobody matches.</p>}
      <ul className="new-dm-list">
        {shown.map((p) => (
          <li key={p.id}>
            <button type="button" className="member-row" onClick={() => pick(p)}>
              <Avatar name={p.name} role={p.role} online={online.has(String(p.id))} size={26} />
              <div className="member-text">
                <span className={`member-name role-text-${p.role}`}>{p.name}</span>
                <span className="muted small">{p.group?.name ?? ROLE_LABELS[p.role]}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
