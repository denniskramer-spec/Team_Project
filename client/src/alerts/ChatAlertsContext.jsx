import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSocketEvent } from '../socket/SocketContext.jsx';
import { useAlerts } from './AlertsContext.jsx';
import { playMessage } from './sound.js';
import ChatPopups from './ChatPopups.jsx';

const ChatAlertsContext = createContext(null);
const MAX_POPUPS = 3;
const APP_TITLE = 'Business Manager';
const desktopSupported = () => typeof Notification !== 'undefined';

// Tells the reader about chat messages they are not looking at, the way a
// messenger does: a popup in the corner, a sound, a desktop notification
// when the window is in the background, and the unread count in the tab
// title. A message in the chat that is open and focused raises nothing.
export function ChatAlertsProvider({ children }) {
  const { user } = useAuth();
  const { settings } = useAlerts();
  const navigate = useNavigate();
  const [popups, setPopups] = useState([]);
  const [counts, setCounts] = useState({ channels: 0, dms: 0 });
  // Chats on screen right now (title keys), and the side panel's openers.
  const viewing = useRef(new Set());
  const panel = useRef({ openThread: null });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const active = Boolean(user && !user.mustChangePassword);

  useEffect(() => { if (!active) { setPopups([]); setCounts({ channels: 0, dms: 0 }); } }, [active]);

  const dismiss = useCallback((id) => setPopups((list) => list.filter((p) => p.id !== id)), []);

  // Opens the chat a popup came from: a channel in section 3, a direct
  // message in the side panel.
  const open = useCallback((popup) => {
    dismiss(popup.id);
    if (popup.dm) {
      const peer = { id: popup.titleKey.slice(3), name: popup.channelName, role: popup.author?.role ?? 'member', group: null };
      if (panel.current.openThread) panel.current.openThread(peer);
      else navigate('/chat/general');
    } else {
      navigate(`/chat/${popup.titleKey}`);
    }
  }, [dismiss, navigate]);

  useSocketEvent('chat:new', ({ titleKey, channelName, message, dm }) => {
    if (!active || !message || String(message.author?.id) === String(user.id)) return;
    if (!settingsRef.current.chat) return;
    const focused = !document.hidden && document.hasFocus();
    // Already reading that chat: the message lands in it, nothing more.
    if (focused && viewing.current.has(titleKey)) return;

    const popup = { id: message.id, titleKey, channelName, dm: Boolean(dm), author: message.author, content: message.content, at: message.createdAt };
    setPopups((list) => (list.some((p) => p.id === popup.id) ? list : [...list.slice(-(MAX_POPUPS - 1)), popup]));
    if (settingsRef.current.sound) playMessage();

    if (settingsRef.current.desktop && desktopSupported() && Notification.permission === 'granted' && !focused) {
      const n = new Notification(dm ? `${message.author?.name ?? 'Someone'} · direct message` : `${message.author?.name ?? 'Someone'} in #${channelName}`, {
        body: message.content,
        tag: `chat-${titleKey}`,
      });
      n.onclick = () => { window.focus(); open(popup); n.close(); };
    }
  });

  // The unread count in the tab title, like a messenger.
  const unread = counts.channels + counts.dms;
  useEffect(() => {
    document.title = unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${APP_TITLE}` : APP_TITLE;
    return () => { document.title = APP_TITLE; };
  }, [unread]);

  // A chat screen says while it is on screen, so it raises no popup.
  const watch = useCallback((titleKey) => { viewing.current.add(titleKey); return () => viewing.current.delete(titleKey); }, []);
  const setPanelApi = useCallback((api) => { panel.current = { ...panel.current, ...api }; }, []);
  // Same numbers again leave the state alone, so the screens that report
  // them do not re-render each other in a loop.
  const updateCounts = useCallback((patch) => setCounts((c) => {
    const next = { ...c, ...patch };
    return next.channels === c.channels && next.dms === c.dms ? c : next;
  }), []);

  const value = useMemo(() => ({
    popups, open, dismiss, unread, dmUnread: counts.dms, channelUnread: counts.channels,
    watch, setPanelApi, setCounts: updateCounts,
  }), [popups, open, dismiss, unread, counts, watch, setPanelApi, updateCounts]);

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
