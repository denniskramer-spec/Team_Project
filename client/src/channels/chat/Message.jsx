import { memo, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { ConfirmDialog } from '../../components/Modal.jsx';
import Avatar from '../../components/Avatar.jsx';
import Dropdown from '../../components/Dropdown.jsx';
import MessageText from './MessageText.jsx';

const time = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// One message. `grouped` hides the avatar and name for consecutive messages
// from the same person, like Discord. The list is updated from the server's
// reply (`onChanged(message)`, `onDeleted(id)`), not only via the socket.
// Memoised: typing in the composer re-renders the chat, not every message.
export default memo(function Message({ message: m, grouped, canDelete, canEdit, onChanged, onDeleted }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.content);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!draft.trim() || draft === m.content) return setEditing(false);
    setBusy(true);
    try {
      const { message } = await api(`/chat/messages/${m.id}`, { method: 'PATCH', body: { content: draft } });
      setEditing(false);
      onChanged(message);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/chat/messages/${m.id}`, { method: 'DELETE' });
      setConfirm(false);
      onDeleted(m.id);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`msg ${grouped ? 'grouped' : ''}`}>
      {grouped
        ? <span className="msg-gutter-time">{time(m.createdAt)}</span>
        : <Avatar name={m.author?.name ?? '?'} role={m.author?.role ?? 'member'} size={38} />}
      <div className="msg-body">
        {!grouped && (
          <div className="msg-head">
            <span className={`strong role-text-${m.author?.role}`}>{m.author?.name ?? 'Deleted user'}</span>
            <span className="muted small" title={new Date(m.createdAt).toLocaleString()}>{time(m.createdAt)}</span>
          </div>
        )}
        {editing ? (
          <div className="msg-edit">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={2000}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
                if (e.key === 'Escape') { setEditing(false); setDraft(m.content); }
              }}
            />
            <span className="muted small">Enter to save · Esc to cancel</span>
          </div>
        ) : (
          <>
            <MessageText content={m.content} />
            {m.editedAt && <span className="muted small edited-tag">(edited)</span>}
          </>
        )}
      </div>
      {!editing && (canEdit || canDelete) && (
        <div className="msg-actions">
          <Dropdown
            label="Message actions"
            items={[
              { label: 'Edit', icon: 'edit', hidden: !canEdit, onClick: () => { setDraft(m.content); setEditing(true); } },
              { label: 'Delete', icon: 'trash', danger: true, hidden: !canDelete, onClick: () => setConfirm(true) },
            ]}
          />
        </div>
      )}
      {confirm && (
        <ConfirmDialog
          title="Delete message?"
          message="It will disappear for everyone in this chat."
          confirmLabel="Delete"
          danger
          busy={busy}
          onConfirm={remove}
          onClose={() => setConfirm(false)}
        />
      )}
    </li>
  );
});
