import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useDebouncedSocketEvent, useReconnect, useSocketEvent } from '../socket/SocketContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { load, save } from '../storage.js';
import { EVENTS } from '../constants.js';
import { playAlert } from './sound.js';
import { desktopSupported, notify } from './notify.js';
import AlertPopup from './AlertPopup.jsx';
import UrgentAlarm from './UrgentAlarm.jsx';

const SETTINGS_KEY = 'bm.alertSettings';
const AlertsContext = createContext(null);

// Tracks unread instructions and raises the alarm when a new one arrives:
// a sound, an in-window popup (a blocking alarm for urgent ones) and,
// if allowed, a desktop notification when the window isn't focused.
export function AlertsProvider({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [unread, setUnread] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [popup, setPopup] = useState(null);
  const [urgentQueue, setUrgentQueue] = useState([]);
  // `chat` is the popup (and sound) for chat messages in chats not on screen.
  const [settings, setSettings] = useState(() => ({ sound: true, desktop: false, chat: true, ...load(SETTINGS_KEY, {}) }));
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const unreadRef = useRef(unread);
  unreadRef.current = unread;
  // Whether the first list of the session has been loaded: urgent ones that
  // turn up in a later load (after a reconnect) were missed, so they alarm.
  const seeded = useRef(false);
  const active = Boolean(user && !user.mustChangePassword);

  const refresh = useCallback(async () => {
    if (!active) return;
    try {
      const d = await api('/instructions/unread');
      const known = new Set(unreadRef.current.map((a) => String(a.id)));
      const missed = seeded.current ? d.instructions.filter((a) => a.priority === 'urgent' && !known.has(String(a.id))) : [];
      setUnread(d.instructions);
      setTotal(d.total);
      setError('');
      seeded.current = true;
      if (missed.length) {
        setUrgentQueue((q) => [...q, ...missed.filter((a) => !q.some((x) => String(x.id) === String(a.id)))]);
        if (settingsRef.current.sound) playAlert('urgent');
      }
    } catch (err) {
      setError(err.message);
    }
  }, [active]);

  useEffect(() => {
    if (active) refresh();
    else { seeded.current = false; setUnread([]); setTotal(0); setPopup(null); setUrgentQueue([]); }
  }, [active, refresh]);
  // Events sent while the socket was down are lost: fetch what they said.
  useReconnect(refresh);

  // A setting kept from a day the browser still allowed notifications is
  // switched off quietly once it no longer does.
  useEffect(() => {
    if (settings.desktop && desktopSupported() && Notification.permission !== 'granted') {
      const next = { ...settings, desktop: false };
      setSettings(next);
      save(SETTINGS_KEY, next);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = useCallback((alert) => {
    navigate(`/instruction/${alert.titleKey}?focus=${alert.id}`);
  }, [navigate]);

  const dismiss = useCallback((id) => {
    setPopup((p) => (p?.id === id ? null : p));
    setUrgentQueue((q) => q.filter((a) => a.id !== id));
  }, []);

  // One request per instruction at a time: a second click while the first
  // is out would count it down twice.
  const pending = useRef(new Set());
  const markRead = useCallback(async (id) => {
    const key = String(id);
    if (pending.current.has(key)) return;
    pending.current.add(key);
    try {
      await api(`/instructions/${id}/read`, { method: 'POST' });
      setUnread((list) => list.filter((a) => String(a.id) !== key));
      setTotal((t) => Math.max(0, t - 1));
      dismiss(id);
    } catch (err) {
      toast.error(err.message);
    } finally {
      pending.current.delete(key);
    }
  }, [dismiss, toast]);

  // Everything, or only the instructions under one title ('all' or a group).
  const markAllRead = useCallback(async (title) => {
    try {
      await api('/instructions/read-all', { method: 'POST', body: title ? { title } : {} });
      if (title) await refresh();
      else { setUnread([]); setTotal(0); setPopup(null); setUrgentQueue([]); }
    } catch (err) {
      toast.error(err.message);
    }
  }, [toast, refresh]);

  const isForMe = useCallback((a) => {
    if (!user || String(a.author.id) === String(user.id)) return false;
    if (a.target === 'member') return String(a.recipientId) === String(user.id);
    return a.target === 'all' || String(a.groupId) === String(user.group?.id);
  }, [user]);

  useSocketEvent(EVENTS.INSTRUCTION_NEW, (alert) => {
    // A repeated event (e.g. after a reconnect) must not count twice.
    if (!isForMe(alert) || unread.some((a) => a.id === alert.id)) return;
    setUnread((list) => [alert, ...list.filter((a) => a.id !== alert.id)]);
    setTotal((t) => t + 1);

    if (settingsRef.current.sound) playAlert(alert.priority);
    if (alert.priority === 'urgent') setUrgentQueue((q) => [...q, alert]);
    else setPopup(alert);

    if (settingsRef.current.desktop) {
      notify(`${alert.priority === 'urgent' ? 'URGENT: ' : ''}New instruction from ${alert.author.name}`, {
        body: [alert.title, alert.preview].filter(Boolean).join('\n'),
        tag: `instruction-${alert.id}`,
        requireInteraction: alert.priority === 'urgent',
      }, () => open(alert));
    }
  });
  useSocketEvent(EVENTS.INSTRUCTION_DELETED, ({ id }) => { dismiss(id); refresh(); });
  // Reads from another tab or device, and edits to an unread instruction,
  // update this one too. Every client hears these: one reload per burst.
  useDebouncedSocketEvent(EVENTS.NAV_CHANGED, refresh);
  useDebouncedSocketEvent(EVENTS.INSTRUCTION_CHANGED, refresh);

  const updateSettings = useCallback(async (patch) => {
    const next = { ...settingsRef.current, ...patch };
    if (patch.desktop && desktopSupported() && Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        next.desktop = false;
        toast.error('Desktop notifications are blocked in your browser settings');
      }
    }
    setSettings(next);
    save(SETTINGS_KEY, next);
  }, [toast]);

  const value = useMemo(() => ({
    unread, total, error, settings, updateSettings, markRead, markAllRead, open, desktopSupported: desktopSupported(),
    testSound: () => playAlert('normal'),
  }), [unread, total, error, settings, updateSettings, markRead, markAllRead, open]);

  return (
    <AlertsContext.Provider value={value}>
      {children}
      {popup && (
        <AlertPopup
          alert={popup}
          onView={() => { open(popup); setPopup(null); }}
          onAck={() => markRead(popup.id)}
          onClose={() => setPopup(null)}
        />
      )}
      {urgentQueue[0] && (
        <UrgentAlarm
          alert={urgentQueue[0]}
          remaining={urgentQueue.length - 1}
          soundOn={settings.sound}
          onAck={() => markRead(urgentQueue[0].id)}
          onView={() => { open(urgentQueue[0]); markRead(urgentQueue[0].id); }}
        />
      )}
    </AlertsContext.Provider>
  );
}

export const useAlerts = () => useContext(AlertsContext);
