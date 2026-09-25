import { useAlerts } from './AlertsContext.jsx';
import { timeAgo } from '../format.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';

// Section 4, Alerts tab: unacknowledged instructions and alarm settings.
export default function AlertsPanel() {
  const { unread, total, settings, updateSettings, markRead, markAllRead, open, desktopSupported, testSound } = useAlerts();

  return (
    <div className="alerts-panel">
      <div className="alert-settings">
        <label className="check">
          <input type="checkbox" checked={settings.sound} onChange={(e) => updateSettings({ sound: e.target.checked })} />
          Alarm sound
          {settings.sound && (
            <button className="link small" type="button" onClick={(e) => { e.preventDefault(); testSound(); }}>test</button>
          )}
        </label>
        {desktopSupported && (
          <label className="check">
            <input type="checkbox" checked={settings.desktop} onChange={(e) => updateSettings({ desktop: e.target.checked })} />
            Desktop notifications
          </label>
        )}
        <p className="muted small">Desktop notifications appear when this window isn't focused.</p>
      </div>

      <div className="panel-section-head">
        <h4>Unread instructions · {total}</h4>
        {total > 0 && <button className="link small" onClick={markAllRead}>Mark all</button>}
      </div>

      {!unread.length && <p className="muted small">Nothing new. Instructions you receive appear here.</p>}

      <ul className="alert-list">
        {unread.map((a) => (
          <li key={a.id} className={a.priority === 'urgent' ? 'urgent' : ''}>
            <button className="alert-item" onClick={() => open(a)}>
              <Avatar name={a.author.name} role={a.author.role} size={28} />
              <div className="alert-item-text">
                <div className="strong small">
                  {a.author.name}
                  {a.priority === 'urgent' && <span className="tag urgent-tag">Urgent</span>}
                </div>
                <div className="muted small">{a.title || a.preview}</div>
                <div className="muted small">
                  {a.target === 'member' ? 'Direct to you' : a.groupName ?? 'Everyone'} · {timeAgo(a.createdAt)}
                </div>
              </div>
            </button>
            <button className="icon-btn" title="Mark as read" aria-label={`Mark instruction from ${a.author.name} as read`} onClick={() => markRead(a.id)}>
              <Icon name="check" size={16} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
