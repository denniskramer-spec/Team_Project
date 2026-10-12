import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSocket } from '../socket/SocketContext.jsx';
import { useAlerts } from '../alerts/AlertsContext.jsx';
import Icon from '../components/Icon.jsx';
import { formatDate } from '../format.js';
import ThemeToggle from '../components/ThemeToggle.jsx';

// Injected by vite.config.js from client/package.json.
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
const YEAR = new Date().getFullYear();

// A clock that ticks on the minute, so the footer never shows a stale time.
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval = null;
    // First tick at the next whole minute, then every minute.
    const first = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, 60_000 - (Date.now() % 60_000));
    return () => { clearTimeout(first); clearInterval(interval); };
  }, []);
  return now;
}

function Brand({ compact }) {
  return (
    <div className="footer-brand">
      <span className="footer-mark" aria-hidden="true">BM</span>
      <span className="footer-copy">
        &copy; {YEAR}{!compact && ' Business Manager'}
      </span>
      {VERSION && <span className="footer-version" title="App version">v{VERSION}</span>}
    </div>
  );
}

// The status bar under the workspace: brand and version on the left, quick
// links in the middle, live status, who is online and the time on the right.
export default function Footer({ onPanel, panelOpen, panelTab }) {
  const { connected, online } = useSocket();
  const { total } = useAlerts();
  const now = useClock();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  const dateShort = formatDate(now);
  const isOn = (tab) => panelOpen && panelTab === tab;

  return (
    <footer className="footer" aria-label="Status bar">
      <Brand />

      <nav className="footer-links" aria-label="Quick links">
        <button className={`footer-link ${isOn('members') ? 'active' : ''}`} onClick={() => onPanel('members')} aria-pressed={isOn('members')}>
          <Icon name="users" size={14} /> Members
        </button>
        <button className={`footer-link ${isOn('alerts') ? 'active' : ''}`} onClick={() => onPanel('alerts')} aria-pressed={isOn('alerts')}>
          <Icon name="bell" size={14} /> Alerts
          {total > 0 && <span className="badge footer-badge">{total > 99 ? '99+' : total}</span>}
        </button>
        <Link className="footer-link" to="/change-password">
          <Icon name="key" size={14} /> Password
        </Link>
      </nav>

      <div className="footer-status">
        <span className="footer-online" title={`${online.size} online now`}>
          <Icon name="users" size={14} />
          <strong>{online.size}</strong> online
        </span>
        <span className={`footer-live ${connected ? 'on' : ''}`} role="status">
          <span className="live-dot" />
          {connected ? 'Live' : 'Reconnecting'}
        </span>
        <time className="footer-clock" dateTime={now.toISOString()} title={date}>
          <span className="footer-date"><Icon name="calendar" size={13} /> {dateShort}</span>
          <span className="footer-time">{time}</span>
        </time>
      </div>
    </footer>
  );
}

// The slim footer under the login, sign-up and change-password cards.
export function AuthFooter() {
  return (
    <footer className="auth-footer">
      <Brand />
      <span className="auth-footer-tag">Team workspace for channels, tasks, finance and reports</span>
      <ThemeToggle className="auth-theme" />
    </footer>
  );
}
