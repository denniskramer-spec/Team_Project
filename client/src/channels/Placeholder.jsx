import Icon from '../components/Icon.jsx';

// Shown for a channel the server lists but this version of the app has no
// page for (e.g. a newer server with an older client).
export default function Placeholder({ channel, title }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name={channel.icon} size={36} /></span>
      <h3>{channel.name} · {title.name}</h3>
      <p className="muted">This channel isn't available in this version of the app. Try reloading the page.</p>
    </div>
  );
}
