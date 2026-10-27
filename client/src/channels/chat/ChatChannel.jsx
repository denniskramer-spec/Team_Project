import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, upload } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useReconnect, useSocket, useSocketEvent } from '../../socket/SocketContext.jsx';
import { useToast } from '../../components/Toast.jsx';
import Icon from '../../components/Icon.jsx';
import Avatar from '../../components/Avatar.jsx';
import Message from './Message.jsx';
import EmojiPicker from '../../components/EmojiPicker.jsx';
import { useWatchChat } from '../../alerts/ChatAlertsContext.jsx';

const GROUP_WINDOW_MS = 5 * 60 * 1000; // same author within 5 minutes = one block
const TYPING_TIMEOUT_MS = 4000;
const TYPING_THROTTLE_MS = 2000;
const NEAR_BOTTOM_PX = 120;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 5;

const dayLabel = (date) => {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

// A channel (#general-chat, a group's chat, #finance-chat) or a direct
// message (title key dm-<userId>, `title.dm` is the other person): the same
// screen on the same API, with the name drawn differently.
export default function ChatChannel({ title }) {
  const { user } = useAuth();
  const dm = title.dm ?? null;
  // A brand-new DM opened without the person's name learns it from the server.
  const [peerName, setPeerName] = useState(null);
  const name = dm ? (title.name === 'Direct message' && peerName) || title.name : title.name;
  const { socket } = useSocket();
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState([]); // images picked, pasted or dropped, not yet sent
  const [previews, setPreviews] = useState([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState([]);
  const [lastReadAt, setLastReadAt] = useState(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(0);

  const listRef = useRef(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInput = useRef(null);
  const emojiButton = useRef(null);
  const lastTypingSent = useRef(0);
  const shouldStick = useRef(true);
  const olderLoaded = useRef(false);
  const loadingOlder = useRef(false);

  const markRead = useCallback(() => {
    api(`/chat/${title.key}/read`, { method: 'POST' }).catch(() => {});
  }, [title.key]);
  // This chat is on screen: its messages land here instead of in a popup.
  useWatchChat(title.key);
  // A message that arrives while the window is in the background stays
  // unread until the reader comes back to it.
  const looking = () => !document.hidden && document.hasFocus();
  useEffect(() => {
    const onFocus = () => { if (shouldStick.current && looking()) { markRead(); setNewBelow(0); } };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [markRead]);

  const load = useCallback(async () => {
    try {
      const d = await api(`/chat/${title.key}/messages`);
      // Replace the newest page; keep older pages the reader already loaded
      // (this also runs after a reconnect).
      setMessages((prev) => {
        const oldest = d.messages[0]?.createdAt;
        const fresh = new Set(d.messages.map((m) => m.id));
        const older = oldest ? prev.filter((m) => m.createdAt <= oldest && !fresh.has(m.id)) : [];
        return [...older, ...d.messages];
      });
      if (!olderLoaded.current) setHasMore(d.hasMore);
      if (d.channel?.name) setPeerName(d.channel.name);
      setLastReadAt(d.lastReadAt);
      setError('');
      markRead();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [title.key, markRead]);

  useEffect(() => { load(); }, [load]);
  // Messages sent while the socket was down never arrived: fetch them.
  useReconnect(load);

  // Keep the newest message in view unless the reader has scrolled up.
  useLayoutEffect(() => {
    if (shouldStick.current) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    shouldStick.current = bottom;
    setAtBottom(bottom);
    if (bottom) setNewBelow(0);
  };

  const loadOlder = async () => {
    const oldest = messages[0]?.createdAt;
    const oldestId = messages[0]?.id;
    if (!oldest || loadingOlder.current) return; // one request at a time
    loadingOlder.current = true;
    const el = listRef.current;
    const before = el.scrollHeight;
    try {
      const d = await api(`/chat/${title.key}/messages?before=${encodeURIComponent(oldest)}&beforeId=${oldestId}`);
      shouldStick.current = false;
      olderLoaded.current = true;
      setMessages((prev) => {
        const have = new Set(prev.map((m) => m.id));
        return [...d.messages.filter((m) => !have.has(m.id)), ...prev];
      });
      setHasMore(d.hasMore);
      // Keep the reader's position after older messages are added on top.
      requestAnimationFrame(() => { el.scrollTop += el.scrollHeight - before; });
    } catch (err) {
      toast.error(err.message);
    } finally {
      loadingOlder.current = false;
    }
  };

  const applyChange = useCallback((message) => {
    setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
  }, []);
  const applyDelete = useCallback((id) => {
    setMessages((prev) => prev.filter((m) => String(m.id) !== String(id)));
  }, []);

  useSocketEvent('chat:new', ({ titleKey, message }) => {
    if (titleKey !== title.key) return;
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    setTyping((t) => t.filter((u) => u.id !== message.author?.id));
    if (shouldStick.current && looking()) markRead();
    else if (message.author?.id !== user.id) setNewBelow((n) => n + 1);
  });
  useSocketEvent('chat:changed', ({ titleKey, message }) => {
    if (titleKey === title.key) applyChange(message);
  });
  useSocketEvent('chat:deleted', ({ titleKey, id }) => {
    if (titleKey === title.key) applyDelete(id);
  });
  useSocketEvent('chat:typing', ({ titleKey, user: who }) => {
    if (titleKey !== title.key || who.id === user.id) return;
    setTyping((prev) => [...prev.filter((u) => u.id !== who.id), { ...who, at: Date.now() }]);
  });

  // Drop typing indicators that have gone quiet.
  useEffect(() => {
    if (!typing.length) return undefined;
    const id = setInterval(() => {
      setTyping((prev) => prev.filter((u) => Date.now() - u.at < TYPING_TIMEOUT_MS));
    }, 1000);
    return () => clearInterval(id);
  }, [typing.length]);

  // Thumbnails of the images waiting to be sent, released when they change.
  useEffect(() => {
    const made = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(made);
    return () => made.forEach((p) => URL.revokeObjectURL(p.url));
  }, [files]);

  // Images come from the + button, a paste (Ctrl+V) or a drop on the composer.
  const addFiles = (list) => {
    const incoming = Array.from(list ?? []).filter(Boolean);
    if (!incoming.length) return;
    const good = [];
    let problem = '';
    for (const f of incoming) {
      if (!IMAGE_TYPES.includes(f.type)) { problem = 'Only PNG, JPEG, GIF or WebP images can be sent'; continue; }
      if (f.size > MAX_IMAGE_BYTES) { problem = 'Each image can be at most 5 MB'; continue; }
      good.push(f);
    }
    const room = MAX_IMAGES - files.length;
    if (good.length > room) { problem = `At most ${MAX_IMAGES} images per message`; good.length = Math.max(room, 0); }
    if (problem) toast.error(problem);
    if (good.length) setFiles([...files, ...good]);
    textareaRef.current?.focus();
  };
  const onPaste = (e) => {
    const items = Array.from(e.clipboardData?.items ?? []).filter((i) => i.kind === 'file');
    if (!items.length) return;
    e.preventDefault();
    addFiles(items.map((i) => i.getAsFile()));
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  // Puts the emoji where the cursor is and keeps the cursor after it.
  const insertEmoji = (char) => {
    const el = textareaRef.current;
    const at = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? at;
    const next = draft.slice(0, at) + char + draft.slice(end);
    setDraft(next);
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
    shouldStick.current = true;
    try {
      let images = [];
      if (files.length) {
        const fd = new FormData();
        files.forEach((f) => fd.append('images', f));
        const uploaded = await upload(`/chat/${title.key}/upload`, fd);
        images = uploaded.images.map(({ file, name, type, size }) => ({ file, name, type, size }));
      }
      const { message } = await api(`/chat/${title.key}/messages`, { method: 'POST', body: { content, images } });
      setDraft('');
      setFiles([]);
      setEmojiOpen(false);
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const onDraftChange = (e) => {
    setDraft(e.target.value);
    const now = Date.now();
    if (socket && now - lastTypingSent.current > TYPING_THROTTLE_MS) {
      lastTypingSent.current = now;
      socket.emit('chat:typing', { titleKey: title.key });
    }
  };

  const jumpToBottom = () => {
    shouldStick.current = true;
    setNewBelow(0);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    markRead();
  };

  // Work out date separators, message grouping and the "new messages" line.
  const rows = [];
  let firstUnreadDone = false;
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    if (!prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString()) {
      rows.push({ type: 'day', key: `day-${m.id}`, date: m.createdAt });
    }
    if (!firstUnreadDone && lastReadAt && new Date(m.createdAt) > new Date(lastReadAt) && m.author?.id !== user.id) {
      rows.push({ type: 'unread', key: `unread-${m.id}` });
      firstUnreadDone = true;
    }
    const last = rows[rows.length - 1];
    const grouped = last?.type === 'msg'
      && last.message.author?.id === m.author?.id
      && new Date(m.createdAt) - new Date(last.message.createdAt) < GROUP_WINDOW_MS;
    rows.push({ type: 'msg', key: m.id, message: m, grouped });
  });

  return (
    <div className="chat">
      <div className="chat-scroll" ref={listRef} onScroll={onScroll}>
        {hasMore && (
          <div className="chat-older">
            <button className="btn small-btn" onClick={loadOlder}>Load older messages</button>
          </div>
        )}
        {!loading && !messages.length && !error && (dm ? (
          <div className="chat-start">
            <Avatar name={name} role={dm.role} size={64} />
            <h3>{name}</h3>
            <p className="muted">This is the beginning of your direct message history with <strong>{name}</strong>.</p>
          </div>
        ) : (
          <div className="chat-start">
            <span className="empty-icon"><Icon name="hash" size={28} /></span>
            <h3>Welcome to #{title.name}</h3>
            <p className="muted">This is the beginning of the conversation.</p>
          </div>
        ))}
        {error && <div className="alert error">{error}</div>}

        <ul className="msg-list">
          {rows.map((row) => {
            if (row.type === 'day') return <li key={row.key} className="day-sep"><span>{dayLabel(row.date)}</span></li>;
            if (row.type === 'unread') return <li key={row.key} className="unread-sep"><span>New messages</span></li>;
            const m = row.message;
            const mine = m.author?.id === user.id;
            return (
              <Message
                key={row.key}
                message={m}
                grouped={row.grouped}
                canEdit={mine}
                canDelete={mine || ['leader', 'admin'].includes(user.role)}
                onChanged={applyChange}
                onDeleted={applyDelete}
              />
            );
          })}
        </ul>
        <div ref={bottomRef} />
      </div>

      {!atBottom && (
        <button className="jump-bottom" onClick={jumpToBottom}>
          {newBelow > 0 ? `${newBelow} new message${newBelow > 1 ? 's' : ''}` : 'Jump to latest'}
          <Icon name="chevronDown" size={16} />
        </button>
      )}

      <div className="chat-typing muted small">
        {typing.length > 0 && (
          <>
            <span className="typing-dots"><i /><i /><i /></span>
            {typing.map((u) => u.name).join(', ')} {typing.length === 1 ? 'is' : 'are'} typing...
          </>
        )}
      </div>

      <form
        className={`chat-composer${dragOver ? ' drag-over' : ''}`}
        onSubmit={(e) => { e.preventDefault(); send(); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {previews.length > 0 && (
          <ul className="image-thumbs composer-thumbs" aria-label="Images to send">
            {previews.map((p, i) => (
              <li key={p.url} className="is-new">
                <img src={p.url} alt={p.file.name} title={p.file.name} />
                <button type="button" className="thumb-remove" onClick={() => setFiles(files.filter((_, n) => n !== i))} aria-label={`Remove ${p.file.name}`}>
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
          <input ref={fileInput} type="file" accept={IMAGE_TYPES.join(',')} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={onDraftChange}
            onPaste={onPaste}
            placeholder={dm ? `Message @${name}` : `Message #${title.name}`}
            rows={1}
            maxLength={2000}
            aria-label={`Message ${name}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
          />
          <div className="composer-emoji">
            <button ref={emojiButton} type="button" className={`composer-btn${emojiOpen ? ' active' : ''}`} onClick={() => setEmojiOpen((o) => !o)} aria-label="Add an emoji" aria-expanded={emojiOpen} title="Emoji">
              <Icon name="smile" size={20} />
            </button>
            {emojiOpen && <EmojiPicker anchor={emojiButton} onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}
          </div>
          <button className="btn primary composer-send" disabled={sending || (!draft.trim() && !files.length)} aria-label="Send message">
            <Icon name="send" size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}
