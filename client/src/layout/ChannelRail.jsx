import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

// Section 1: the channel list.
export default function ChannelRail({ channels, current }) {
  return (
    <div className="rail">
      {channels.map((c) => (
        <Link
          key={c.key}
          to={`/${c.key}`}
          className={`rail-item ${c.key === current ? 'active' : ''} ${c.key === 'admin' ? 'rail-admin' : ''}`}
          title={c.name}
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
