import { memo, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import Modal, { ConfirmDialog } from '../../components/Modal.jsx';
import Avatar from '../../components/Avatar.jsx';
import Dropdown from '../../components/Dropdown.jsx';
import MessageText from './MessageText.jsx';
import { formatClock } from '../../format.js';
import { MESSAGE_MAX_CHARS } from '../../constants.js';

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
  const [lightbox, setLightbox] = useState(null); // index of the open image
  const images = m.images ?? [];

  const save = async () => {
    // A message with pictures may have its text taken away entirely.
    if ((!draft.trim() && !images.length) || draft === m.content) return setEditing(false);
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
        ? <span className="msg-gutter-time">{formatClock(m.createdAt)}</span>
        : <Avatar name={m.author?.name ?? '?'} role={m.author?.role ?? 'member'} size={38} />}
      <div className="msg-body">
        {!grouped && (
          <div className="msg-head">
            <span className={`strong role-text-${m.author?.role}`}>{m.author?.name ?? 'Deleted user'}</span>
            <span className="muted small" title={new Date(m.createdAt).toLocaleString()}>{formatClock(m.createdAt)}</span>
          </div>
        )}
        {editing ? (
          <div className="msg-edit">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={MESSAGE_MAX_CHARS}
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
            {m.content && <MessageText content={m.content} />}
            {images.length > 0 && (
              <ul className="msg-images" aria-label="Attached images">
                {images.map((img, i) => (
                  <li key={img.file}>
                    <button type="button" className="thumb-open" onClick={() => setLightbox(i)} aria-label={`Open ${img.name}`}>
                      <img src={img.url} alt={img.name} title={img.name} loading="lazy" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
      {lightbox !== null && (
        <Modal title={`${m.author?.name ?? 'Image'} · ${lightbox + 1} / ${images.length}`} onClose={() => setLightbox(null)} width={900}>
          <div className="lightbox">
            <img src={images[lightbox].url} alt={images[lightbox].name} />
            <div className="lightbox-nav">
              {images.length > 1
                ? <button className="btn" type="button" onClick={() => setLightbox((lightbox + images.length - 1) % images.length)}>Previous</button>
                : <span />}
              <a className="muted small" href={images[lightbox].url} target="_blank" rel="noopener noreferrer">{images[lightbox].name}</a>
              {images.length > 1
                ? <button className="btn" type="button" onClick={() => setLightbox((lightbox + 1) % images.length)}>Next</button>
                : <span />}
            </div>
          </div>
        </Modal>
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
