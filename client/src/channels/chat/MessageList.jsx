import Message from './Message.jsx';
import { dayLabel } from './buildRows.js';

// The scrolling list: "load older" on top, the rows, and the sentinel the
// sticky scroll keeps in view. `empty` is what to show for a chat with no
// messages yet.
export default function MessageList({ rows, user, loading, error, empty, hasMore, loadingOlder, onLoadOlder, scroll, onChanged, onDeleted }) {
  const canDeleteOthers = ['leader', 'admin'].includes(user.role);
  return (
    <div className="chat-scroll" ref={scroll.listRef} onScroll={scroll.onScroll}>
      {hasMore && (
        <div className="chat-older">
          <button className="btn small-btn" onClick={onLoadOlder} disabled={loadingOlder}>
            {loadingOlder ? 'Loading...' : 'Load older messages'}
          </button>
        </div>
      )}
      {!loading && !rows.length && !error && empty}
      {error && <div className="alert error">{error}</div>}

      <ul className="msg-list">
        {rows.map((row) => {
          if (row.type === 'day') return <li key={row.key} className="day-sep"><span>{dayLabel(row.date)}</span></li>;
          if (row.type === 'unread') return <li key={row.key} className="unread-sep"><span>New messages</span></li>;
          const m = row.message;
          const mine = m.author?.id === user.id;
          return (
            <Message
              key={row.key}
              message={m}
              grouped={row.grouped}
              canEdit={mine}
              canDelete={mine || canDeleteOthers}
              onChanged={onChanged}
              onDeleted={onDeleted}
            />
          );
        })}
      </ul>
      <div ref={scroll.bottomRef} />
    </div>
  );
}
