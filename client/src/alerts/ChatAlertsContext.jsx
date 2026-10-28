import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSocketEvent } from '../socket/SocketContext.jsx';
import { EVENTS, dmPeerId } from '../constants.js';
import { useOpenDm } from '../channels/chat/useOpenDm.js';
import { useAlerts } from './AlertsContext.jsx';
import { playMessage } from './sound.js';
import { notify, windowFocused } from './notify.js';
import ChatPopups from './ChatPopups.jsx';

const ChatAlertsContext = createContext(null);
const MAX_POPUPS = 3;
const APP_TITLE = 'Business Manager';

// Tells the reader about chat messages they are not looking at, the way a
// messenger does: a popup in the corner, a sound, a desktop notification
// when the window is in the background, and the unread count in the tab
// title. A message in the chat that is open and focused raises nothing.
export function ChatAlertsProvider({ children }) {
  const { user } = useAuth();
  const { settings } = useAlerts();
  const navigate = useNavigate();
  const openDm = useOpenDm();
  const [popups, setPopups] = useState([]);
  const [counts, setCounts] = useState({ channels: 0, dms: 0 });
  // Chats on screen right now (title keys).
  const viewing = useRef(new Set());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const active = Boolean(user && !user.mustChangePassword);

  useEffect(() => { if (!active) { setPopups([]); setCounts({ channels: 0, dms: 0 }); } }, [active]);

  const dismiss = useCallback((id) => setPopups((list) => list.filter((p) => p.id !== id)), []);
  const dismissViewed = useCallback(() => setPopups((list) => (
    list.some((p) => viewing.current.has(p.titleKey)) ? list.filter((p) => !viewing.current.has(p.titleKey)) : list
  )), []);

  // Opens the chat a popup came from, under Chat: a channel, or the direct
  // message with that person (sent along, so a brand-new one has a name).
  const open = useCallback((popup) => {
    dismiss(popup.id);
    if (popup.dm) openDm({ id: dmPeerId(popup.titleKey), name: popup.channelName, role: popup.author?.role ?? 'member', group: null });
    else navigate(`/chat/${popup.titleKey}`);
  }, [dismiss, navigate, openDm]);

  useSocketEvent(EVENTS.CHAT_NEW, ({ titleKey, channelName, message, dm }) => {
    if (!active || !message || String(message.author?.id) === String(user.id)) return;
    if (!settingsRef.current.chat) return;
    // Already reading that chat: the message lands in it, nothing more.
    if (windowFocused() && viewing.current.has(titleKey)) return;

    // A message with no text is a picture: the popup says so.
    const text = message.content || (message.images?.length > 1 ? `📷 ${message.images.length} images` : '📷 Image');
    const popup = { id: message.id, titleKey, channelName, dm: Boolean(dm), author: message.author, content: text, at: message.createdAt };
    setPopups((list) => (list.some((p) => p.id === popup.id) ? list : [...list.slice(-(MAX_POPUPS - 1)), popup]));
    if (settingsRef.current.sound) playMessage();

    if (settingsRef.current.desktop) {
      const who = message.author?.name ?? 'Someone';
      notify(dm ? `${who} · direct message` : `${who} in #${channelName}`, { body: text, tag: `chat-${titleKey}` }, () => open(popup));
    }
  });

  // Back in the window with that chat open: its popups have served.
  useEffect(() => {
    const onFocus = () => { if (windowFocused()) dismissViewed(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [dismissViewed]);

  // The unread count in the tab title, like a messenger.
  const unread = counts.channels + counts.dms;
  useEffect(() => {
    document.title = unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${APP_TITLE}` : APP_TITLE;
    return () => { document.title = APP_TITLE; };
  }, [unread]);

  // A chat screen says while it is on screen, so it raises no popup, and
  // the popups it already raised go.
  const watch = useCallback((titleKey) => {
    viewing.current.add(titleKey);
    setPopups((list) => (list.some((p) => p.titleKey === titleKey) ? list.filter((p) => p.titleKey !== titleKey) : list));
    return () => viewing.current.delete(titleKey);
  }, []);
  // Whether the reader has this chat open and is looking at it.
  const isViewing = useCallback((titleKey) => viewing.current.has(titleKey) && windowFocused(), []);
  // Same numbers again leave the state alone, so the screens that report
  // them do not re-render each other in a loop.
  const updateCounts = useCallback((patch) => setCounts((c) => {
    const next = { ...c, ...patch };
    return next.channels === c.channels && next.dms === c.dms ? c : next;
  }), []);

  const value = useMemo(() => ({
    popups, open, dismiss, unread, dmUnread: counts.dms, channelUnread: counts.channels,
    watch, isViewing, setCounts: updateCounts,
  }), [popups, open, dismiss, unread, counts, watch, isViewing, updateCounts]);

  return (
    <ChatAlertsContext.Provider value={value}>
      {children}
      {active && popups.length > 0 && <ChatPopups popups={popups} onOpen={open} onDismiss={dismiss} />}
    </ChatAlertsContext.Provider>
  );
}

export const useChatAlerts = () => useContext(ChatAlertsContext);

// Marks a chat as on screen while `visible` holds, so its own messages raise
// no popup.
export function useWatchChat(titleKey, visible = true) {
  const watch = useChatAlerts()?.watch;
  useEffect(() => {
    if (!watch || !visible || !titleKey) return undefined;
    return watch(titleKey);
  }, [watch, titleKey, visible]);
}
