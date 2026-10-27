import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

// Section 1: the channel list, icon-only for every role. The channel's name
// flies out beside the icon on hover (or keyboard focus), and a pill on the
// rail's left edge marks the open channel (tall) or the one under the
// pointer (short). Chat (and a member's Settings below it) is pinned to the
// foot of the rail.
export default function ChannelRail({ channels, current }) {
  const [tip, setTip] = useState(null);

  const show = (e, name) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ name, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hide = () => setTip(null);

  return (
    <div className="rail">
      {channels.map((c) => (
        <Link
          key={c.key}
          to={`/${c.key}`}
          className={`rail-item ${c.key === current ? 'active' : ''} ${c.key === 'admin' ? 'rail-admin' : ''} ${c.key === 'chat' ? 'rail-foot' : ''}`}
          aria-label={c.name}
          aria-current={c.key === current ? 'page' : undefined}
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
        </Link>
      ))}
      {tip && createPortal(
        <span className="rail-tip" role="tooltip" style={{ top: tip.top, left: tip.left }}>{tip.name}</span>,
        document.body,
      )}
    </div>
  );
}
