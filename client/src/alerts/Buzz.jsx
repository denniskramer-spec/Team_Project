import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSocketEvent } from '../socket/SocketContext.jsx';
import { useAlerts } from './AlertsContext.jsx';
import { EVENTS } from '../constants.js';
import Icon from '../components/Icon.jsx';
import { formatClock } from '../format.js';
import { canNotify, desktopSupported, windowFocused } from './notify.js';
import { load, save } from '../storage.js';
import { playBuzz } from './sound.js';

const SHAKE_MS = 900;
const POPUP_MS = 12 * 1000;

// Shakes the whole app for a moment (a flash instead for people who asked
// their system for less motion).
export function shakeScreen() {
  const root = document.getElementById('root');
  if (!root) return;
  root.classList.remove('buzz-shake');
  void root.offsetWidth; // restart the animation
  root.classList.add('buzz-shake');
  setTimeout(() => root.classList.remove('buzz-shake'), SHAKE_MS);
}

const BAR_KEY = 'bm.desktopBarHidden';

// On the chat page until desktop notifications are on: with Chrome behind
// another program (File Explorer, Word...) the app cannot come forward by
// itself, so a buzz or a message is only seen if the system shows it, as a
// desktop notification. One click turns them on; when the browser blocks
// them for this site, the bar says how to unblock them.
export function DesktopAlertsBar() {
  const { settings, updateSettings } = useAlerts() ?? {};
  const [hidden, setHidden] = useState(() => load(BAR_KEY, false));
  const [permission, setPermission] = useState(() => (desktopSupported() ? Notification.permission : 'unsupported'));
  if (!settings || hidden || permission === 'unsupported' || (permission === 'granted' && settings.desktop)) return null;
  const turnOn = async () => {
    await updateSettings({ desktop: true });
    setPermission(Notification.permission);
  };
  const hide = () => { setHidden(true); save(BAR_KEY, true); };
  return (
    <div className="desktop-bar" role="note">
      <Icon name="bell" size={16} />
      {permission === 'denied' ? (
        <span>Chrome blocks notifications for this app, so a buzz or a message can&apos;t reach you while Chrome is behind other windows. Click the icon left of the address bar, set <strong>Notifications</strong> to <strong>Allow</strong>, then reload.</span>
      ) : (
        <span>See buzzes and messages even when Chrome is behind other windows: turn on desktop notifications.</span>
      )}
      {permission !== 'denied' && <button type="button" className="btn primary small-btn" onClick={turnOn}>Turn on</button>}
      <button type="button" className="link small" onClick={hide}>Not now</button>
    </div>
  );
}

// Someone shook this screen from a chat (routes/chat.js, POST .../buzz):
// the app shakes and rumbles, a popup says who and opens the chat, the tab
// title flashes until the window is looked at, and, with desktop
// notifications allowed, a notification that stays until clicked brings the
// window to the front. A web page cannot raise its own window over other
// programs; that notification is as close as a browser allows.
export default function BuzzListener() {
  const { user } = useAuth();
  const { settings } = useAlerts() ?? {};
  const navigate = useNavigate();
  const [popup, setPopup] = useState(null);
  const flashing = useRef(null);

  const stopFlash = useCallback(() => {
    if (!flashing.current) return;
    clearInterval(flashing.current.timer);
    document.title = flashing.current.title;
    flashing.current = null;
  }, []);
  useEffect(() => {
    window.addEventListener('focus', stopFlash);
    return () => { window.removeEventListener('focus', stopFlash); stopFlash(); };
  }, [stopFlash]);
  useEffect(() => {
    if (!popup) return undefined;
    const t = setTimeout(() => setPopup(null), POPUP_MS);
    return () => clearTimeout(t);
  }, [popup]);

  const open = useCallback((b) => { setPopup(null); navigate(`/chat/${b.titleKey}`); }, [navigate]);

  useSocketEvent(EVENTS.CHAT_BUZZ, (b) => {
    if (!user || !b?.from || String(b.from.id) === String(user.id)) return;
    shakeScreen();
    if (settings?.sound !== false) playBuzz();
    navigator.vibrate?.([200, 100, 200]);
    setPopup(b);
    window.focus();
    const text = b.dm ? `${b.from.name} shook your screen` : `${b.from.name} shook #${b.channelName}`;
    if (!windowFocused()) {
      if (!flashing.current) {
        const title = document.title;
        let on = false;
        flashing.current = { title, timer: setInterval(() => { on = !on; document.title = on ? `📳 ${text}` : title; }, 900) };
      }
      if (canNotify()) {
        const n = new Notification(text, { body: 'Click to open the chat', tag: `buzz-${b.titleKey}`, requireInteraction: true });
        n.onclick = () => { window.focus(); open(b); n.close(); };
      }
    }
  });

  if (!popup) return null;
  return (
    <div className="buzz-popup" aria-live="assertive">
      <div className="chat-popup buzz-alert" role="alert">
        <button type="button" className="chat-popup-main" onClick={() => open(popup)} title="Open the chat">
          <span className="buzz-alert-icon"><Icon name="vibrate" size={18} /></span>
          <span className="chat-popup-text">
            <span className="chat-popup-head">
              <span className="strong">{popup.from.name} shook your screen</span>
              <span className="muted small chat-popup-time">{formatClock(popup.at)}</span>
            </span>
            <span className="chat-popup-content">{popup.dm ? 'in your direct messages' : `in #${popup.channelName}`} · open the chat</span>
          </span>
        </button>
        <button type="button" className="icon-btn chat-popup-close" onClick={() => setPopup(null)} aria-label="Dismiss"><Icon name="close" size={14} /></button>
      </div>
    </div>
  );
}
