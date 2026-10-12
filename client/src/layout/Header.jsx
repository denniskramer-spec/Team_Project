import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSocket } from '../socket/SocketContext.jsx';
import { useAlerts } from '../alerts/AlertsContext.jsx';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import RoleBadge, { ROLE_LABELS } from '../components/RoleBadge.jsx';
import ProfileForm from '../components/ProfileForm.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import DateTag from '../components/DateTag.jsx';

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
      <button className={`user-chip ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <Avatar name={user.name} role={user.role} size={30} />
        <span className="user-chip-text">
          <span className="user-chip-name">{user.name}</span>
          <span className="user-chip-role">{ROLE_LABELS[user.role] ?? user.role}</span>
        </span>
        <Icon name="chevronDown" size={16} className="user-chip-caret" />
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
            <dt>Birthday</dt><dd>{user.birthday ? <DateTag value={user.birthday} utc muted={false}  icon="cake" /> : 'Not set'}</dd>
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
      <Link className="brand" to="/" title="Business Manager">
        <span className="brand-mark" aria-hidden="true">BM</span>
        <span className="brand-text">
          <span className="brand-name">Business Manager</span>
          <span className="brand-tag">Team workspace</span>
        </span>
      </Link>
      <div className="crumbs" title={`${channel.name} · ${title.name}`}>
        <span className="crumb crumb-channel">
          <Icon name={channel.icon} size={15} />
          <span className="crumb-label">{channel.name}</span>
        </span>
      </div>
      <div className="header-right">
        <span className={`live ${connected ? 'on' : ''}`} role="status" title={connected ? 'Live updates connected' : 'Reconnecting...'}>
          <span className="live-dot" />
          <span className="live-label">{connected ? 'Live' : 'Offline'}</span>
        </span>
        <ThemeToggle />
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
