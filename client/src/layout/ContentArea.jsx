import Icon from '../components/Icon.jsx';
import ChannelContent from '../channels/index.jsx';

// Section 3: content for the selected channel + title.
export default function ContentArea({ channel, title }) {
  return (
    <main className="content">
      <div className="content-head">
        <Icon name={channel.key === 'chat' ? 'hash' : channel.icon} size={20} className="muted" />
        <h2>{title.name}</h2>
        <span className="content-sub muted">{channel.name}</span>
      </div>
      <div className={`content-body ${channel.key === "chat" ? "flush" : ""}`}>
        <ChannelContent channel={channel} title={title} />
      </div>
    </main>
  );
}
