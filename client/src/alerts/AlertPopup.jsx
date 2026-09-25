import { useEffect, useRef } from 'react';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { ROLE_LABELS } from '../components/RoleBadge.jsx';

const AUTO_HIDE_MS = 15000;

// In-window alert for a new (normal priority) instruction.
export default function AlertPopup({ alert, onView, onAck, onClose }) {
  // Restart the timer only when a different alert is shown.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const id = setTimeout(() => closeRef.current(), AUTO_HIDE_MS);
    return () => clearTimeout(id);
  }, [alert.id]);

  return (
    <div className="alert-popup" role="alert">
      <div className="alert-popup-head">
        <Icon name="megaphone" size={16} />
        <span>
          New instruction
          {alert.target === 'member' ? ' · For you' : alert.groupName ? ` · ${alert.groupName}` : ' · Everyone'}
        </span>
        <button className="icon-btn" onClick={onClose} aria-label="Dismiss"><Icon name="close" size={14} /></button>
      </div>
      <div className="alert-popup-body">
        <Avatar name={alert.author.name} role={alert.author.role} size={36} />
        <div>
          <div className="strong">{alert.author.name} <span className="muted small">{ROLE_LABELS[alert.author.role]}</span></div>
          {alert.title && <div className="alert-popup-title">{alert.title}</div>}
          <p className="alert-popup-text">{alert.preview}</p>
        </div>
      </div>
      <div className="alert-popup-actions">
        <button className="btn small-btn" onClick={onView}>View</button>
        <button className="btn small-btn primary" onClick={onAck}><Icon name="check" size={14} /> Got it</button>
      </div>
      <div className="alert-popup-timer" style={{ animationDuration: `${AUTO_HIDE_MS}ms` }} />
    </div>
  );
}
