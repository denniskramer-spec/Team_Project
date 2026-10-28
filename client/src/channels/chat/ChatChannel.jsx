import { useCallback, useEffect, useRef } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import Icon from '../../components/Icon.jsx';
import Avatar from '../../components/Avatar.jsx';
import { useWatchChat } from '../../alerts/ChatAlertsContext.jsx';
import { windowFocused } from '../../alerts/notify.js';
import { DM_PLACEHOLDER_NAME } from '../../constants.js';
import { useChatMessages } from './useChatMessages.js';
import { useTypingIndicator } from './useTypingIndicator.js';
import { useStickyScroll } from './useStickyScroll.js';
import { buildRows } from './buildRows.js';
import MessageList from './MessageList.jsx';
import ChatComposer from './ChatComposer.jsx';

// A channel (#general-chat, a group's chat, #finance-chat) or a direct
// message (title key dm-<userId>, `title.dm` is the other person): the same
// screen on the same API, with the name drawn differently.
export default function ChatChannel({ title }) {
  const { user } = useAuth();
  const dm = title.dm ?? null;

  // The chat is read up to the newest message on screen, but only while the
  // reader is looking (a background tab keeps its unread count), and only
  // once per message, not on every focus.
  const readUpTo = useRef(undefined);
  const newestRef = useRef(null);
  const markRead = useCallback((upTo = newestRef.current) => {
    if (upTo === readUpTo.current) return;
    readUpTo.current = upTo;
    api(`/chat/${title.key}/read`, { method: 'POST' }).catch(() => {});
  }, [title.key]);

  const typing = useTypingIndicator(title.key, user.id);
  const chat = useChatMessages(title.key, {
    // The page just loaded is newer than what the last render saw.
    onLoaded: (newestAt) => { if (windowFocused() && newestAt) markRead(newestAt); },
    onIncoming: (message) => {
      typing.stopped(message.author?.id);
      if (scroll.stick.current && windowFocused()) markRead(message.createdAt);
      else if (message.author?.id !== user.id) scroll.bump();
    },
  });
  const { messages } = chat;
  newestRef.current = messages[messages.length - 1]?.createdAt ?? null;
  const scroll = useStickyScroll(messages);
  const name = dm ? ((title.name === DM_PLACEHOLDER_NAME && chat.peerName) || title.name) : title.name;

  // This chat is on screen: its messages land here instead of in a popup.
  useWatchChat(title.key);
  // Back from another window or tab: what arrived meanwhile has now been seen.
  useEffect(() => {
    const onFocus = () => { if (scroll.stick.current && windowFocused()) { markRead(); scroll.reset(); } };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markRead]);

  const onSent = (message) => {
    scroll.stick.current = true;
    chat.append(message);
  };
  const jumpToBottom = () => { scroll.jumpToBottom(); markRead(); };

  const rows = buildRows(messages, chat.lastReadAt, user.id);
  const empty = dm ? (
    <div className="chat-start">
      <Avatar name={name} role={dm.role} size={64} />
      <h3>{name}</h3>
      <p className="muted">This is the beginning of your direct message history with <strong>{name}</strong>.</p>
    </div>
  ) : (
    <div className="chat-start">
      <span className="empty-icon"><Icon name="hash" size={28} /></span>
      <h3>Welcome to #{title.name}</h3>
      <p className="muted">This is the beginning of the conversation.</p>
    </div>
  );

  return (
    <div className="chat">
      <MessageList
        rows={rows}
        user={user}
        loading={chat.loading}
        error={chat.error}
        empty={empty}
        hasMore={chat.hasMore}
        loadingOlder={chat.loadingOlder}
        onLoadOlder={() => scroll.keepPosition(chat.loadOlder)}
        scroll={scroll}
        onChanged={chat.applyChange}
        onDeleted={chat.applyDelete}
      />

      {!scroll.atBottom && (
        <button className="jump-bottom" onClick={jumpToBottom}>
          {scroll.newBelow > 0 ? `${scroll.newBelow} new message${scroll.newBelow > 1 ? 's' : ''}` : 'Jump to latest'}
          <Icon name="chevronDown" size={16} />
        </button>
      )}

      <div className="chat-typing muted small">
        {typing.typing.length > 0 && (
          <>
            <span className="typing-dots"><i /><i /><i /></span>
            {typing.typing.map((u) => u.name).join(', ')} {typing.typing.length === 1 ? 'is' : 'are'} typing...
          </>
        )}
      </div>

      <ChatComposer titleKey={title.key} name={name} dm={dm} onSent={onSent} onTyping={typing.noteTyping} />
    </div>
  );
}
