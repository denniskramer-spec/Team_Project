import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useSocket, useSocketEvent } from '../socket/SocketContext.jsx';
import { ROLE_LABELS } from '../components/RoleBadge.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import AlertsPanel from '../alerts/AlertsPanel.jsx';
import { useAlerts } from '../alerts/AlertsContext.jsx';

const ROLE_ORDER = ['admin', 'leader', 'boss', 'member'];

function MemberRow({ member, online }) {
  return (
    <li className={`member-row ${online ? '' : 'offline'}`}>
      <Avatar name={member.name} role={member.role} online={online} size={32} />
      <div className="member-text">
        <span className={`member-name role-text-${member.role}`}>{member.name}</span>
        <span className="muted small">{member.group?.name ?? ROLE_LABELS[member.role]}</span>
      </div>
    </li>
  );
}

function Members() {
  const { online } = useSocket();
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');

  const loadMembers = () => api('/users/directory')
    .then((d) => { setMembers(d.users); setError(''); })
    .catch((err) => setError(err.message));

  useEffect(() => { loadMembers(); }, []);
  useSocketEvent('directory:changed', loadMembers);

  // Online members grouped by role (like Discord), then everyone offline.
  const sections = useMemo(() => {
    const on = members.filter((m) => online.has(m.id));
    const off = members.filter((m) => !online.has(m.id));
    return [
      ...ROLE_ORDER.map((role) => ({
        key: role,
        label: `${ROLE_LABELS[role]} — ${on.filter((m) => m.role === role).length}`,
        items: on.filter((m) => m.role === role),
        online: true,
      })).filter((s) => s.items.length),
      { key: 'offline', label: `Offline — ${off.length}`, items: off, online: false },
    ].filter((s) => s.items.length);
  }, [members, online]);

  if (error) return <div className="alert error">{error}</div>;
  return sections.map((s) => (
    <section key={s.key} className="member-section">
      <h4>{s.label}</h4>
      <ul>{s.items.map((m) => <MemberRow key={m.id} member={m} online={s.online} />)}</ul>
    </section>
  ));
}

// Section 4: hidden by default, slides in from the right when the arrow is clicked.
export default function SidePanel({ open, onToggle, tab, setTab }) {
  const { total } = useAlerts();

  return (
    <>
      <button
        className={`panel-toggle ${open ? 'open' : ''}`}
        onClick={onToggle}
        aria-label={open ? 'Hide side panel' : 'Show side panel'}
        aria-expanded={open}
      >
        <Icon name={open ? 'chevronRight' : 'chevronLeft'} size={18} />
      </button>
      <aside className={`side-panel ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="panel-tabs">
          <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>Members</button>
          <button className={tab === 'alerts' ? 'active' : ''} onClick={() => setTab('alerts')}>
            Alerts{total > 0 && <span className="badge tab-badge">{total}</span>}
          </button>
          <button className="icon-btn panel-close" onClick={onToggle} aria-label="Close panel">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="panel-body">
          {tab === 'members' ? <Members /> : <AlertsPanel />}
        </div>
      </aside>
    </>
  );
}
