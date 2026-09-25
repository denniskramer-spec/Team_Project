import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSocket } from '../socket/SocketContext.jsx';
import { useAlerts } from '../alerts/AlertsContext.jsx';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import RoleBadge from '../components/RoleBadge.jsx';
import ProfileForm from '../components/ProfileForm.jsx';
import { formatBirthday } from '../format.js';

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={ref}>
      <button className="user-chip" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Avatar name={user.name} role={user.role} size={28} />
        <span className="user-chip-name">{user.name}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-profile">
            <Avatar name={user.name} role={user.role} size={44} />
            <div>
              <strong>{user.name}</strong>
              <div className="muted small">@{user.username}</div>
              <RoleBadge role={user.role} group={user.group} />
            </div>
          </div>
          <dl className="profile small">
            <dt>Member ID</dt><dd>{user.memberId}</dd>
            <dt>Group</dt><dd>{user.group?.name ?? 'None'}</dd>
            <dt>Birthday</dt><dd>{user.birthday ? formatBirthday(user.birthday) : 'Not set'}</dd>
          </dl>
          <button className="menu-item" role="menuitem" onClick={() => { setOpen(false); setEditing(true); }}>
            <Icon name="user" size={16} /> Edit profile
          </button>
          <Link className="menu-item" to="/change-password" role="menuitem">
            <Icon name="key" size={16} /> Change password
          </Link>
          <button className="menu-item danger" onClick={logout} role="menuitem">
            <Icon name="logout" size={16} /> Log out
          </button>
        </div>
      )}
      {editing && <ProfileForm onClose={() => setEditing(false)} />}
    </div>
  );
}

export default function Header({ channel, title, onMenu, onBell }) {
  const { connected } = useSocket();
  const { total } = useAlerts();

  return (
    <header className="header">
      <button className="icon-btn hamburger" onClick={onMenu} aria-label="Open channels">
        <Icon name="menu" />
      </button>
      <div className="brand">
        <span className="brand-mark">BM</span>
        <span className="brand-name">Business Manager</span>
      </div>
      <div className="crumbs">
        <Icon name={channel.icon} size={16} />
        <span>{channel.name}</span>
        <Icon name="chevronRight" size={14} className="muted" />
        <strong>{title.name}</strong>
      </div>
      <div className="header-right">
        <span className={`live ${connected ? 'on' : ''}`} title={connected ? 'Live updates connected' : 'Reconnecting...'}>
          <span className="live-dot" /> {connected ? 'Live' : 'Offline'}
        </span>
        <button
          className={`icon-btn bell ${total ? 'has-unread' : ''}`}
          onClick={onBell}
          aria-label={total ? `${total} unread instructions` : 'Alerts'}
          title={total ? `${total} unread instructions` : 'Alerts'}
        >
          <Icon name="bell" />
          {total > 0 && <span className="badge bell-badge">{total > 99 ? '99+' : total}</span>}
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
