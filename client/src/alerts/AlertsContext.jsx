import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSocketEvent } from '../socket/SocketContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { load, save } from '../storage.js';
import { playAlert } from './sound.js';
import AlertPopup from './AlertPopup.jsx';
import UrgentAlarm from './UrgentAlarm.jsx';

const SETTINGS_KEY = 'bm.alertSettings';
const AlertsContext = createContext(null);

const desktopSupported = () => typeof Notification !== 'undefined';

// Tracks unread instructions and raises the alarm when a new one arrives:
// a sound, an in-window popup (a blocking alarm for urgent ones) and,
// if allowed, a desktop notification when the window isn't focused.
export function AlertsProvider({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [unread, setUnread] = useState([]);
  const [total, setTotal] = useState(0);
  const [popup, setPopup] = useState(null);
  const [urgentQueue, setUrgentQueue] = useState([]);
  const [settings, setSettings] = useState(() => ({ sound: true, desktop: false, ...load(SETTINGS_KEY, {}) }));
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const active = Boolean(user && !user.mustChangePassword);

  const refresh = useCallback(() => {
    if (!active) return;
    api('/instructions/unread')
      .then((d) => { setUnread(d.instructions); setTotal(d.total); })
      .catch(() => {});
  }, [active]);

  useEffect(() => {
    if (active) refresh();
    else { setUnread([]); setTotal(0); setPopup(null); setUrgentQueue([]); }
  }, [active, refresh]);

  const open = useCallback((alert) => {
    navigate(`/instruction/${alert.titleKey}?focus=${alert.id}`);
  }, [navigate]);

  const dismiss = useCallback((id) => {
    setPopup((p) => (p?.id === id ? null : p));
    setUrgentQueue((q) => q.filter((a) => a.id !== id));
  }, []);

  const markRead = useCallback(async (id) => {
    try {
      await api(`/instructions/${id}/read`, { method: 'POST' });
      setUnread((list) => list.filter((a) => String(a.id) !== String(id)));
      setTotal((t) => Math.max(0, t - 1));
      dismiss(id);
    } catch (err) {
      toast.error(err.message);
    }
  }, [dismiss, toast]);

  const markAllRead = useCallback(async () => {
    try {
      await api('/instructions/read-all', { method: 'POST', body: {} });
      setUnread([]);
      setTotal(0);
      setPopup(null);
      setUrgentQueue([]);
    } catch (err) {
      toast.error(err.message);
    }
  }, [toast]);

  const isForMe = useCallback((a) => {
    if (!user || String(a.author.id) === String(user.id)) return false;
    if (a.target === 'member') return String(a.recipientId) === String(user.id);
    return a.target === 'all' || String(a.groupId) === String(user.group?.id);
  }, [user]);

  useSocketEvent('instruction:new', (alert) => {
    if (!isForMe(alert)) return;
    setUnread((list) => [alert, ...list.filter((a) => a.id !== alert.id)]);
    setTotal((t) => t + 1);

    if (settingsRef.current.sound) playAlert(alert.priority);
    if (alert.priority === 'urgent') setUrgentQueue((q) => [...q, alert]);
    else setPopup(alert);

    const s = settingsRef.current;
    if (s.desktop && desktopSupported() && Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) {
      const n = new Notification(`${alert.priority === 'urgent' ? 'URGENT: ' : ''}New instruction from ${alert.author.name}`, {
        body: [alert.title, alert.preview].filter(Boolean).join('\n'),
        tag: `instruction-${alert.id}`,
        requireInteraction: alert.priority === 'urgent',
      });
      n.onclick = () => { window.focus(); open(alert); n.close(); };
    }
  });
  useSocketEvent('instruction:deleted', ({ id }) => { dismiss(id); refresh(); });
  // Reads from another tab or device update this one too.
  useSocketEvent('nav:changed', refresh);

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
    unread, total, settings, updateSettings, markRead, markAllRead, open, desktopSupported: desktopSupported(),
    testSound: () => playAlert('normal'),
  }), [unread, total, settings, updateSettings, markRead, markAllRead, open]);

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
