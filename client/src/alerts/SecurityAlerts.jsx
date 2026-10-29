import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSocketEvent } from '../socket/SocketContext.jsx';
import { useAlerts } from './AlertsContext.jsx';
import { EVENTS } from '../constants.js';
import Icon from '../components/Icon.jsx';
import { formatClock } from '../format.js';
import { notify } from './notify.js';
import { playAlert } from './sound.js';

const MAX_POPUPS = 4;

// Dangerous security log entries (server/src/utils/securityAlerts.js), the
// moment they are written: for admins and the team leader, top right, until
// dismissed. Clicking one opens Admin → Security.
export default function SecurityAlerts() {
  const { user } = useAuth();
  const { settings } = useAlerts() ?? {};
  const navigate = useNavigate();
  const [popups, setPopups] = useState([]);
  const dismiss = useCallback((id) => setPopups((list) => list.filter((p) => p.id !== id)), []);
  const open = () => { setPopups([]); navigate('/admin/security'); };

  useSocketEvent(EVENTS.SECURITY_ALERT, (alert) => {
    if (!['admin', 'leader'].includes(user?.role) || !alert?.id) return;
    setPopups((list) => (list.some((p) => p.id === alert.id) ? list : [...list.slice(-(MAX_POPUPS - 1)), alert]));
    if (settings?.sound) playAlert();
    if (settings?.desktop) notify(alert.title, { body: alert.text, tag: `security-${alert.kind}`, requireInteraction: true }, open);
  });

  if (!popups.length) return null;
  return (
    <div className="security-alerts" aria-live="assertive">
      {popups.map((p) => (
        <div key={p.id} className="chat-popup security-alert" role="alert">
          <button type="button" className="chat-popup-main" onClick={open} title="Open the security log">
            <span className="security-alert-icon"><Icon name="shield" size={18} /></span>
            <span className="chat-popup-text">
              <span className="chat-popup-head">
                <span className="strong">{p.title}</span>
                <span className="muted small chat-popup-time">{formatClock(p.at)}</span>
              </span>
              <span className="chat-popup-content">{p.text}</span>
            </span>
          </button>
          <button type="button" className="icon-btn chat-popup-close" onClick={() => dismiss(p.id)} aria-label="Dismiss"><Icon name="close" size={14} /></button>
        </div>
      ))}
    </div>
  );
}
