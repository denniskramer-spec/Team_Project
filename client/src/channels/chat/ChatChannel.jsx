import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useSocket, useSocketEvent } from '../../socket/SocketContext.jsx';
import { useToast } from '../../components/Toast.jsx';
import Icon from '../../components/Icon.jsx';
import Message from './Message.jsx';

const GROUP_WINDOW_MS = 5 * 60 * 1000; // same author within 5 minutes = one block
const TYPING_TIMEOUT_MS = 4000;
const TYPING_THROTTLE_MS = 2000;
const NEAR_BOTTOM_PX = 120;

const dayLabel = (date) => {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
};

export default function ChatChannel({ title }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState([]);
  const [lastReadAt, setLastReadAt] = useState(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(0);

  const listRef = useRef(null);
  const bottomRef = useRef(null);
  const lastTypingSent = useRef(0);
  const shouldStick = useRef(true);

  const markRead = useCallback(() => {
    api(`/chat/${title.key}/read`, { method: 'POST' }).catch(() => {});
  }, [title.key]);

  const load = useCallback(async () => {
    try {
      const d = await api(`/chat/${title.key}/messages`);
      setMessages(d.messages);
      setHasMore(d.hasMore);
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
    if (!oldest) return;
    const el = listRef.current;
    const before = el.scrollHeight;
    try {
      const d = await api(`/chat/${title.key}/messages?before=${encodeURIComponent(oldest)}`);
      shouldStick.current = false;
      setMessages((prev) => [...d.messages, ...prev]);
      setHasMore(d.hasMore);
      // Keep the reader's position after older messages are added on top.
      requestAnimationFrame(() => { el.scrollTop += el.scrollHeight - before; });
    } catch (err) {
      toast.error(err.message);
    }
  };

  useSocketEvent('chat:new', ({ titleKey, message }) => {
    if (titleKey !== title.key) return;
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    setTyping((t) => t.filter((u) => u.id !== message.author?.id));
    if (shouldStick.current) markRead();
    else if (message.author?.id !== user.id) setNewBelow((n) => n + 1);
  });
  useSocketEvent('chat:changed', ({ titleKey, message }) => {
    if (titleKey !== title.key) return;
    setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
  });
  useSocketEvent('chat:deleted', ({ titleKey, id }) => {
    if (titleKey !== title.key) return;
    setMessages((prev) => prev.filter((m) => String(m.id) !== String(id)));
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

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    shouldStick.current = true;
    try {
      const { message } = await api(`/chat/${title.key}/messages`, { method: 'POST', body: { content } });
      setDraft('');
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
        {!loading && !messages.length && !error && (
          <div className="chat-start">
            <span className="empty-icon"><Icon name="hash" size={28} /></span>
            <h3>Welcome to #{title.name}</h3>
            <p className="muted">This is the beginning of the conversation.</p>
          </div>
        )}
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
                onChanged={() => {}}
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

      <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea
          value={draft}
          onChange={onDraftChange}
          placeholder={`Message #${title.name}`}
          rows={1}
          maxLength={2000}
          aria-label={`Message ${title.name}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
        />
        <button className="btn primary" disabled={sending || !draft.trim()} aria-label="Send message">
          <Icon name="send" size={18} />
        </button>
      </form>
    </div>
  );
}
