import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

// Section 1: the channel list. Bosses, the leader and admins get icons with
// their names underneath. A member's rail is icon-only: round buttons, and
// the channel's name flies out beside the icon on hover (or focus).
export default function ChannelRail({ channels, current, compact = false }) {
  const [tip, setTip] = useState(null);

  const show = (e, name) => {
    if (!compact) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ name, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hide = () => setTip(null);

  return (
    <div className={`rail${compact ? ' compact' : ''}`}>
      {channels.map((c) => (
        <Link
          key={c.key}
          to={`/${c.key}`}
          className={`rail-item ${c.key === current ? 'active' : ''} ${c.key === 'admin' ? 'rail-admin' : ''} ${c.key === 'settings' ? 'rail-settings' : ''}`}
          title={compact ? undefined : c.name}
          aria-label={c.name}
          onMouseEnter={(e) => show(e, c.name)}
          onMouseLeave={hide}
          onFocus={(e) => show(e, c.name)}
          onBlur={hide}
        >
          <span className="rail-pill" />
          <span className="rail-icon">
            <Icon name={c.icon} size={22} />
            {c.badge > 0 && <span className="badge rail-badge">{c.badge}</span>}
          </span>
          {!compact && <span className={`rail-label${c.name.length > 10 ? ' long' : ''}`}>{c.name}</span>}
        </Link>
      ))}
      {compact && tip && createPortal(
        <span className="rail-tip" role="tooltip" style={{ top: tip.top, left: tip.left }}>{tip.name}</span>,
        document.body,
      )}
    </div>
  );
}
