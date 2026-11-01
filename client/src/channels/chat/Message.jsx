import { memo, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import Modal, { ConfirmDialog } from '../../components/Modal.jsx';
import Avatar from '../../components/Avatar.jsx';
import Dropdown from '../../components/Dropdown.jsx';
import Icon from '../../components/Icon.jsx';
import EmojiPicker from '../../components/EmojiPicker.jsx';
import { noteCopy } from '../../security/useCopyWatch.js';
import MessageText from './MessageText.jsx';
import { formatClock } from '../../format.js';
import { MESSAGE_MAX_CHARS } from '../../constants.js';

// The quick reactions in the ⋯ menu, as in Discord.
export const QUICK_REACTIONS = ['👍', '✅', '❤️', '😂', '🎉', '👀', '🙏'];
// Below this many pixels from the top of the window, pop-ups open upwards.
const ROOM_ABOVE = 420;

// One message. `grouped` hides the avatar and name for consecutive messages
// from the same person, like Discord. The list is updated from the server's
// reply (`onChanged(message)`, `onDeleted(id, deletedAt)`), not only via the socket.
// `deleteHides`: deleting only hides it from members (a member's own message).
// `canFlag`: may mark it as not about work (team chats are for work only).
// On hover a toolbar offers a reaction, a reply and the ⋯ menu.
// Memoised: typing in the composer re-renders the chat, not every message.
export default memo(function Message({ message: m, grouped, meId, canDelete, deleteHides, canEdit, canFlag, onChanged, onDeleted, onReply, onJump }) {
  const toast = useToast();
  const [picker, setPicker] = useState(null); // null, or 'up' / 'down'
  const [menuUp, setMenuUp] = useState(false);
  const [menuAt, setMenuAt] = useState(null); // right-click spot for the ⋯ menu
  const toolbar = useRef(null);
  const reactButton = useRef(null);
  const deleted = Boolean(m.deletedAt);
  const reactions = m.reactions ?? [];
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
      const { deletedAt } = await api(`/chat/messages/${m.id}`, { method: 'DELETE' });
      setConfirm(false);
      onDeleted(m.id, deletedAt);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const react = async (emoji) => {
    try {
      const { message } = await api(`/chat/messages/${m.id}/reactions`, { method: 'POST', body: { emoji } });
      onChanged(message);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(m.content);
      noteCopy(m.content); // a button copy fires no copy event
      toast('Text copied');
    } catch {
      toast.error('Could not copy the text');
    }
  };

  const flag = async (flagged) => {
    try {
      const { message } = await api(`/chat/messages/${m.id}/off-topic`, { method: 'POST', body: { flagged } });
      onChanged(message);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const roomAbove = () => (toolbar.current?.getBoundingClientRect().top ?? 0) > ROOM_ABOVE;
  const openPicker = () => setPicker((p) => (p ? null : roomAbove() ? 'up' : 'down'));

  // Right-click opens the ⋯ menu at the pointer, as in Discord. Links and the
  // edit box keep the browser's own menu.
  const openContextMenu = (e) => {
    if (editing || e.target.closest('a, textarea, input, .menu')) return;
    e.preventDefault();
    setMenuAt({ x: e.clientX, y: e.clientY });
  };

  const menuItems = [
    { label: 'Reply', icon: 'reply', hidden: deleted, onClick: () => onReply(m) },
    { label: 'Copy text', icon: 'copy', hidden: deleted || !m.content, onClick: copyText },
    { label: m.offTopic ? 'Remove not-work flag' : 'Flag as not work', icon: 'flag', hidden: !canFlag, onClick: () => flag(!m.offTopic) },
    { label: 'Edit', icon: 'edit', hidden: !canEdit, onClick: () => { setDraft(m.content); setEditing(true); } },
    { label: 'Delete', icon: 'trash', danger: true, hidden: !canDelete, onClick: () => setConfirm(true) },
  ];
  const quickReactions = deleted ? undefined : (close) => (
    <div className="quick-reactions" role="group" aria-label="Quick reactions">
      {QUICK_REACTIONS.map((e) => (
        <button key={e} type="button" role="menuitem" className="emoji-btn" aria-label={`React with ${e}`} onClick={() => { close(); react(e); }}>{e}</button>
      ))}
    </div>
  );

  return (
    <li id={`msg-${m.id}`} className={`msg ${grouped ? 'grouped' : ''} ${deleted ? 'msg-deleted' : ''} ${m.offTopic ? 'msg-off-topic' : ''}`} onContextMenu={openContextMenu}>
      {grouped
        ? <span className="msg-gutter-time">{formatClock(m.createdAt)}</span>
        : <Avatar name={m.author?.name ?? '?'} role={m.author?.role ?? 'member'} size={38} />}
      <div className="msg-body">
        {m.replyTo && (
          <button type="button" className="msg-reply-quote" onClick={() => !m.replyTo.deleted && onJump(m.replyTo.id)} disabled={m.replyTo.deleted}>
            <Icon name="reply" size={14} />
            {m.replyTo.deleted
              ? <span className="muted">Deleted message</span>
              : <><span className="strong">{m.replyTo.authorName}</span> <span className="msg-reply-text">{m.replyTo.preview}</span></>}
          </button>
        )}
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
            {m.offTopic && (
              <div className="off-topic-note" title={`Flagged by ${m.offTopic.by} · ${new Date(m.offTopic.at).toLocaleString()}`}>
                <Icon name="flag" size={14} />
                <span><strong>Not work-related.</strong> This chat is for work only. Flagged by {m.offTopic.by}.</span>
              </div>
            )}
            {m.deletedAt && (
              <span className="muted small edited-tag deleted-tag" title={`Deleted ${new Date(m.deletedAt).toLocaleString()}`}>(deleted)</span>
            )}
            {reactions.length > 0 && (
              <ul className="msg-reactions" aria-label="Reactions">
                {reactions.map((r) => {
                  const mine = r.users.some((u) => u.id === meId);
                  return (
                    <li key={r.emoji}>
                      <button
                        type="button"
                        className={`reaction${mine ? ' mine' : ''}`}
                        aria-pressed={mine}
                        title={r.users.map((u) => u.name).join(', ')}
                        disabled={deleted}
                        onClick={() => react(r.emoji)}
                      >
                        <span className="reaction-emoji">{r.emoji}</span> {r.users.length}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
      {!editing && (
        <div ref={toolbar} className={`msg-toolbar${picker ? ' open' : ''}`}>
          {!deleted && (
            <div className="msg-react">
              <button ref={reactButton} type="button" className="icon-btn" onClick={openPicker} aria-label="Add reaction" aria-expanded={Boolean(picker)} title="Add reaction">
                <Icon name="smile" size={18} />
              </button>
              {picker && (
                <div className={`msg-picker ${picker}`}>
                  <EmojiPicker anchor={reactButton} onPick={(e) => { setPicker(null); react(e); }} onClose={() => setPicker(null)} />
                </div>
              )}
            </div>
          )}
          {!deleted && (
            <button type="button" className="icon-btn" onClick={() => onReply(m)} aria-label="Reply" title="Reply">
              <Icon name="reply" size={18} />
            </button>
          )}
          <div onMouseDownCapture={() => setMenuUp(roomAbove())} onKeyDownCapture={() => setMenuUp(roomAbove())}>
            <Dropdown label="Message actions" items={menuItems} header={quickReactions} up={menuUp} openAt={menuAt} className="msg-menu" />
          </div>
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
          message={deleteHides
            ? 'It will disappear from the chat. Bosses and the team leader can still see it, marked deleted.'
            : 'It will disappear for everyone in this chat.'}
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
