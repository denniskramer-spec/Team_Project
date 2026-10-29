import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { useReconnect, useSocketEvent } from '../../socket/SocketContext.jsx';
import { EVENTS } from '../../constants.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { seesDeletedMessages } from '../../roles.js';

// The messages of one chat: the newest page, older pages on demand, and the
// changes the socket brings. `onIncoming(message)` runs for a message that
// just arrived from anyone; `onLoaded(newestAt)` after each load of the newest page.
export function useChatMessages(titleKey, { onIncoming, onLoaded } = {}) {
  const toast = useToast();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');
  const [lastReadAt, setLastReadAt] = useState(null);
  const [peerName, setPeerName] = useState(null); // a brand-new DM learns the name from the server
  const held = useRef(messages);
  held.current = messages;
  const olderLoaded = useRef(false);
  const olderBusy = useRef(false);
  const callbacks = useRef({ onIncoming, onLoaded });
  callbacks.current = { onIncoming, onLoaded };

  const append = useCallback((message) => {
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  }, []);
  const applyChange = useCallback((message) => {
    setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
  }, []);
  // `deletedAt` set: a member hid their own message, which bosses, the
  // leader and admins keep seeing, marked deleted. Otherwise it is gone.
  const keepsDeleted = seesDeletedMessages(user);
  const applyDelete = useCallback((id, deletedAt = null) => {
    setMessages((prev) => (deletedAt && keepsDeleted
      ? prev.map((m) => (String(m.id) === String(id) ? { ...m, deletedAt } : m))
      : prev.filter((m) => String(m.id) !== String(id))));
  }, [keepsDeleted]);

  // The newest page (also after a reconnect). Older pages the reader already
  // loaded stay, unless so much arrived meanwhile that they no longer join up
  // with the new page: then they go and "Load older" comes back.
  const load = useCallback(async () => {
    try {
      const d = await api(`/chat/${titleKey}/messages`);
      const oldest = d.messages[0]?.createdAt;
      const newestHeld = held.current[held.current.length - 1]?.createdAt;
      const gap = d.hasMore && newestHeld && oldest > newestHeld;
      if (gap) olderLoaded.current = false;
      setMessages((prev) => {
        if (gap || !oldest) return d.messages;
        const fresh = new Set(d.messages.map((m) => m.id));
        return [...prev.filter((m) => m.createdAt <= oldest && !fresh.has(m.id)), ...d.messages];
      });
      if (!olderLoaded.current) setHasMore(d.hasMore);
      if (d.channel?.name) setPeerName(d.channel.name);
      setLastReadAt(d.lastReadAt);
      setError('');
      callbacks.current.onLoaded?.(d.messages[d.messages.length - 1]?.createdAt ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [titleKey]);

  useEffect(() => { load(); }, [load]);
  // Messages sent while the socket was down never arrived: fetch them.
  useReconnect(load);

  // One request at a time; the caller keeps the scroll position.
  const loadOlder = useCallback(async () => {
    const first = held.current[0];
    if (!first || olderBusy.current) return;
    olderBusy.current = true;
    setLoadingOlder(true);
    try {
      const d = await api(`/chat/${titleKey}/messages?before=${encodeURIComponent(first.createdAt)}&beforeId=${first.id}`);
      olderLoaded.current = true;
      setMessages((prev) => {
        const have = new Set(prev.map((m) => m.id));
        return [...d.messages.filter((m) => !have.has(m.id)), ...prev];
      });
      setHasMore(d.hasMore);
    } catch (err) {
      toast.error(err.message);
    } finally {
      olderBusy.current = false;
      setLoadingOlder(false);
    }
  }, [titleKey, toast]);

  useSocketEvent(EVENTS.CHAT_NEW, ({ titleKey: key, message }) => {
    if (key !== titleKey) return;
    append(message);
    callbacks.current.onIncoming?.(message);
  });
  useSocketEvent(EVENTS.CHAT_CHANGED, ({ titleKey: key, message }) => {
    if (key === titleKey) applyChange(message);
  });
  useSocketEvent(EVENTS.CHAT_DELETED, ({ titleKey: key, id, deletedAt }) => {
    if (key === titleKey) applyDelete(id, deletedAt);
  });

  return { messages, hasMore, loading, loadingOlder, error, lastReadAt, peerName, load, loadOlder, append, applyChange, applyDelete };
}
