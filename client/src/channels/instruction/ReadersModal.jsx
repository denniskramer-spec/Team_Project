import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { timeAgo } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import Avatar from '../../components/Avatar.jsx';

// Who has acknowledged an instruction, and who hasn't yet.
export default function ReadersModal({ instruction, onClose }) {
  const [recipients, setRecipients] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/instructions/${instruction.id}/reads`)
      .then((d) => setRecipients(d.recipients))
      .catch((err) => setError(err.message));
  }, [instruction.id]);

  const read = recipients?.filter((r) => r.readAt) ?? [];
  const waiting = recipients?.filter((r) => !r.readAt) ?? [];

  const list = (items, empty) => (items.length ? (
    <ul className="reader-list">
      {items.map((r) => (
        <li key={r.id}>
          <Avatar name={r.name} role={r.role} size={28} />
          <span className="strong">{r.name}</span>
          <span className="muted small">{r.note ?? r.group ?? ''}</span>
          {r.readAt && <span className="muted small reader-time">{timeAgo(r.readAt)}</span>}
        </li>
      ))}
    </ul>
  ) : <p className="muted small">{empty}</p>);

  return (
    <Modal title="Read receipts" onClose={onClose} width={440}>
      {error && <div className="alert error">{error}</div>}
      {!recipients && !error && <p className="muted">Loading...</p>}
      {recipients && (
        <div className="readers">
          <h4>Acknowledged · {read.length}</h4>
          {list(read, 'Nobody yet.')}
          <h4>Not yet · {waiting.length}</h4>
          {list(waiting, 'Everyone has acknowledged it.')}
        </div>
      )}
    </Modal>
  );
}
