import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useReconnect, useSocket, useSocketEvent } from '../socket/SocketContext.jsx';
import { useToast } from '../components/Toast.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import MessageText from '../channels/chat/MessageText.jsx';

const time = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const day = (d) => new Date(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

// A direct message conversation in the side panel: the thread with one
// person, on the same chat API as the channels (title key dm-<userId>).
export default function DmThread({ peer, onBack }) {
  const { user } = useAuth();
  const { socket, online } = useSocket();
  const toast = useToast();
  const titleKey = `dm-${peer.id}`;
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const listRef = useRef(null);
  const bottomRef = useRef(null);
  const lastTypingSent = useRef(0);

  const markRead = useCallback(() => api(`/chat/${titleKey}/read`, { method: 'POST' }).catch(() => {}), [titleKey]);

  const load = useCallback(async () => {
    try {
      const d = await api(`/chat/${titleKey}/messages`);
      setMessages(d.messages);
      setHasMore(d.hasMore);
      markRead();
    } catch (err) {
      toast.error(err.message);
    }
  }, [titleKey, markRead, toast]);

  useEffect(() => { load(); }, [load]);
  useReconnect(load);
  useLayoutEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  useSocketEvent('chat:new', ({ titleKey: key, message }) => {
    if (key !== titleKey) return;
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    setTyping(false);
    markRead();
  });
  useSocketEvent('chat:changed', ({ titleKey: key, message }) => { if (key === titleKey) setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m))); });
  useSocketEvent('chat:deleted', ({ titleKey: key, id }) => { if (key === titleKey) setMessages((prev) => prev.filter((m) => String(m.id) !== String(id))); });
  useSocketEvent('chat:typing', ({ titleKey: key, user: who }) => {
    if (key !== titleKey || who.id === user.id) return;
    setTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 4000);
  });
  const typingTimer = useRef(null);
  useEffect(() => () => clearTimeout(typingTimer.current), []);

  const loadOlder = async () => {
    const oldest = messages[0];
    if (!oldest) return;
    try {
      const d = await api(`/chat/${titleKey}/messages?before=${encodeURIComponent(oldest.createdAt)}&beforeId=${oldest.id}`);
      setMessages((prev) => [...d.messages.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
      setHasMore(d.hasMore);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const { message } = await api(`/chat/${titleKey}/messages`, { method: 'POST', body: { content } });
      setDraft('');
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const onDraft = (e) => {
    setDraft(e.target.value);
    const now = Date.now();
    if (socket && now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now;
      socket.emit('chat:typing', { titleKey });
    }
  };

  const isOnline = online.has(String(peer.id));

  return (
    <div className="dm-thread">
      <div className="dm-head">
        <button className="icon-btn" onClick={onBack} aria-label="Back to messages"><Icon name="chevronLeft" size={16} /></button>
        <Avatar name={peer.name} role={peer.role} online={isOnline} size={24} />
        <div className="member-text">
          <span className={`member-name role-text-${peer.role}`}>{peer.name}</span>
          <span className="muted small">{isOnline ? 'online' : peer.group ?? ''}</span>
        </div>
      </div>
      <div className="dm-scroll" ref={listRef}>
        {hasMore && <div className="chat-older"><button className="btn small-btn" onClick={loadOlder}>Older</button></div>}
        {!messages.length && <p className="muted small dm-empty">No messages yet. Say hi.</p>}
        <ul className="dm-list">
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            const mine = m.author?.id === user.id;
            return (
              <li key={m.id} className={`dm-item${mine ? ' mine' : ''}`}>
                {newDay && <div className="dm-day muted small">{day(m.createdAt)}</div>}
                <div className="dm-bubble" title={new Date(m.createdAt).toLocaleString()}>
                  <MessageText content={m.content} />
                  <span className="dm-time">{time(m.createdAt)}{m.editedAt ? ' · edited' : ''}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <div ref={bottomRef} />
      </div>
      <div className="chat-typing muted small">{typing && <><span className="typing-dots"><i /><i /><i /></span>{peer.name} is typing...</>}</div>
      <form className="dm-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea
          value={draft}
          onChange={onDraft}
          placeholder={`Message ${peer.name}`}
          rows={1}
          maxLength={2000}
          aria-label={`Message ${peer.name}`}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button className="btn primary" disabled={sending || !draft.trim()} aria-label="Send"><Icon name="send" size={16} /></button>
      </form>
    </div>
  );
}
