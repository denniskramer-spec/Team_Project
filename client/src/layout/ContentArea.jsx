import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import ChannelContent from '../channels/index.jsx';
import { useSocket } from '../socket/SocketContext.jsx';

// Section 3: content for the selected channel + title.
export default function ContentArea({ channel, title }) {
  const { online } = useSocket();
  const dm = title.dm;
  const dmOnline = dm ? online.has(String(dm.id)) : false;
  // Where a page puts its own buttons in the head (the chat's "Delete chat").
  const [headSlot, setHeadSlot] = useState(null);
  return (
    <main className="content">
      <div className="content-head">
        {dm
          ? <Avatar name={title.name} role={dm.role} online={dmOnline} size={24} />
          : <Icon name={channel.key === 'chat' ? 'hash' : channel.icon} size={20} className="muted" />}
        <h2>{title.name}</h2>
        {dm && <span className="muted small content-head-sub">{dmOnline ? 'Online' : 'Offline'}</span>}
        <div className="content-head-actions" ref={setHeadSlot} />
      </div>
      <div className={`content-body ${channel.key === "chat" ? "flush" : ""}`}>
        <ChannelContent channel={channel} title={title} headSlot={headSlot} />
      </div>
    </main>
  );
}
