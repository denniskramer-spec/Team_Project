import { useEffect, useRef, useState } from 'react';
import { api, uploadImages } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { useImageFiles } from '../../components/useImageFiles.js';
import Icon from '../../components/Icon.jsx';
import EmojiPicker from '../../components/EmojiPicker.jsx';
import { MESSAGE_MAX_CHARS } from '../../constants.js';
import { shakeScreen } from '../../alerts/Buzz.jsx';

// The box at the foot of a chat: text, images (picked, pasted or dropped)
// and emoji. `onSent(message)` gets the server's copy of what was sent.
// `replyTo` is the message being answered, shown above the box until sent
// or cancelled (×, or Escape in the box). With `canBuzz`, a button shakes
// the screens of the people in the chat (yours shakes too, to show it went).
export default function ChatComposer({ titleKey, name, dm, onSent, onTyping, replyTo, onCancelReply, canBuzz }) {
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState([]); // images not yet sent
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sending, setSending] = useState(false);
  const [buzzing, setBuzzing] = useState(false);
  const textareaRef = useRef(null);
  const fileInput = useRef(null);
  const emojiButton = useRef(null);
  // File -> the server's reference, so a send that fails after the upload
  // does not upload the same pictures again.
  const uploaded = useRef(new Map());
  const images = useImageFiles({ files, onFiles: setFiles, label: 'message', onProblem: toast.error });
  useEffect(() => { if (replyTo) textareaRef.current?.focus(); }, [replyTo]);

  const addFiles = (list) => {
    images.add(list);
    textareaRef.current?.focus();
  };

  // Puts the emoji where the cursor is and keeps the cursor after it.
  const insertEmoji = (char) => {
    const el = textareaRef.current;
    const at = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? at;
    setDraft(draft.slice(0, at) + char + draft.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(at + char.length, at + char.length);
    });
  };

  const send = async () => {
    const content = draft.trim();
    if ((!content && !files.length) || sending) return;
    setSending(true);
    try {
      const fresh = files.filter((f) => !uploaded.current.has(f));
      if (fresh.length) {
        const { images: refs } = await uploadImages(`/chat/${titleKey}/upload`, fresh);
        fresh.forEach((f, i) => uploaded.current.set(f, refs[i]));
      }
      const { message } = await api(`/chat/${titleKey}/messages`, {
        method: 'POST',
        body: { content, images: files.map((f) => uploaded.current.get(f)), replyTo: replyTo?.id ?? null },
      });
      setDraft('');
      setFiles([]);
      setEmojiOpen(false);
      uploaded.current = new Map();
      onSent(message);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  // One buzz every 10 seconds (the server holds the same limit).
  const buzz = async () => {
    if (buzzing) return;
    setBuzzing(true);
    try {
      await api(`/chat/${titleKey}/buzz`, { method: 'POST' });
      shakeScreen();
      toast(dm ? `You shook ${name}'s screen` : `You shook #${name}`);
      setTimeout(() => setBuzzing(false), 10 * 1000);
    } catch (err) {
      toast.error(err.message);
      setBuzzing(false);
    }
  };

  const onDraftChange = (e) => {
    setDraft(e.target.value);
    onTyping();
  };

  return (
    <form
      className={`chat-composer${dragOver ? ' drag-over' : ''}`}
      onSubmit={(e) => { e.preventDefault(); send(); }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { setDragOver(false); images.onDrop(e); textareaRef.current?.focus(); }}
    >
      {replyTo && (
        <div className="composer-reply">
          <Icon name="reply" size={14} />
          <span>Replying to <strong>{replyTo.author?.name ?? 'Deleted user'}</strong></span>
          <span className="composer-reply-text muted">{replyTo.content || 'Image'}</span>
          <button type="button" className="icon-btn" onClick={onCancelReply} aria-label="Cancel reply" title="Cancel reply">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {images.previews.length > 0 && (
        <ul className="image-thumbs composer-thumbs" aria-label="Images to send">
          {images.previews.map((p, i) => (
            <li key={p.url} className="is-new">
              <img src={p.url} alt={p.file.name} title={p.file.name} />
              <button type="button" className="thumb-remove" onClick={() => images.remove(i)} aria-label={`Remove ${p.file.name}`}>
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="composer-box">
        <button type="button" className="composer-btn" onClick={() => fileInput.current?.click()} aria-label="Attach images" title="Attach images (or paste / drop them)">
          <Icon name="plus" size={20} />
        </button>
        <input ref={fileInput} type="file" accept={images.accept} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={onDraftChange}
          onPaste={images.onPaste}
          placeholder={dm ? `Message @${name}` : `Message #${name}`}
          rows={1}
          maxLength={MESSAGE_MAX_CHARS}
          aria-label={`Message ${name}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            if (e.key === 'Escape' && replyTo) { e.preventDefault(); onCancelReply(); }
          }}
        />
        <div className="composer-emoji">
          <button ref={emojiButton} type="button" className={`composer-btn${emojiOpen ? ' active' : ''}`} onClick={() => setEmojiOpen((o) => !o)} aria-label="Add an emoji" aria-expanded={emojiOpen} title="Emoji">
            <Icon name="smile" size={20} />
          </button>
          {emojiOpen && <EmojiPicker anchor={emojiButton} onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}
        </div>
        {canBuzz && (
          <button type="button" className="composer-btn composer-buzz" onClick={buzz} disabled={buzzing} aria-label={dm ? `Shake ${name}'s screen` : `Shake the screens in #${name}`} title={dm ? `Shake ${name}'s screen` : 'Shake everyone’s screen in this chat'}>
            <Icon name="vibrate" size={20} />
          </button>
        )}
        <button className="btn primary composer-send" disabled={sending || (!draft.trim() && !files.length)} aria-label="Send message">
          <Icon name="send" size={18} />
        </button>
      </div>
    </form>
  );
}
