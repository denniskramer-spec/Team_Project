import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

// Section 1: the channel list, for every role: an icon with the channel's
// name under it. The open channel is a tinted tile with a pill on the
// rail's left edge (a short pill marks the one under the pointer). Chat
// (and a member's Settings below it) is pinned to the foot of the rail.
export default function ChannelRail({ channels, current }) {
  return (
    <div className="rail">
      {channels.map((c) => (
        <Link
          key={c.key}
          to={`/${c.key}`}
          className={`rail-item ${c.key === current ? 'active' : ''} ${c.key === 'admin' ? 'rail-admin' : ''} ${c.key === 'chat' ? 'rail-foot' : ''}`}
          aria-label={c.name}
          aria-current={c.key === current ? 'page' : undefined}
        >
          <span className="rail-pill" />
          <span className="rail-icon">
            <Icon name={c.icon} size={22} />
            {c.badge > 0 && <span className="badge rail-badge">{c.badge}</span>}
          </span>
          <span className="rail-label">{c.name}</span>
        </Link>
      ))}
    </div>
  );
}
