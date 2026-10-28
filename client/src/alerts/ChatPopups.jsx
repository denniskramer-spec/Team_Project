import { useEffect, useRef } from 'react';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { formatClock } from '../format.js';

const AUTO_HIDE_MS = 8000;

function Popup({ popup, onOpen, onDismiss }) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const id = setTimeout(() => dismissRef.current(popup.id), AUTO_HIDE_MS);
    return () => clearTimeout(id);
  }, [popup.id]);

  return (
    <div className="chat-popup" role="status">
      <button type="button" className="chat-popup-main" onClick={() => onOpen(popup)} title="Open the chat">
        <Avatar name={popup.author?.name ?? '?'} role={popup.author?.role ?? 'member'} size={36} />
        <span className="chat-popup-text">
          <span className="chat-popup-head">
            <span className={`strong role-text-${popup.author?.role}`}>{popup.author?.name ?? 'Someone'}</span>
            <span className="muted small chat-popup-where">
              <Icon name={popup.dm ? 'message' : 'hash'} size={12} /> {popup.dm ? 'Direct message' : popup.channelName}
            </span>
            <span className="muted small chat-popup-time">{formatClock(popup.at)}</span>
          </span>
          <span className="chat-popup-content">{popup.content}</span>
        </span>
      </button>
      <button type="button" className="icon-btn chat-popup-close" onClick={() => onDismiss(popup.id)} aria-label="Dismiss"><Icon name="close" size={14} /></button>
      <span className="chat-popup-timer" style={{ animationDuration: `${AUTO_HIDE_MS}ms` }} />
    </div>
  );
}

// New messages, stacked in the corner like a messenger. Clicking one opens
// that chat; they go away on their own after a few seconds.
export default function ChatPopups({ popups, onOpen, onDismiss }) {
  return (
    <div className="chat-popups" aria-live="polite">
      {popups.map((p) => <Popup key={p.id} popup={p} onOpen={onOpen} onDismiss={onDismiss} />)}
    </div>
  );
}
