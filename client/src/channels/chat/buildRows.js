// What the message list draws, oldest first: day separators, the "New
// messages" line and author grouping. Pure, so it can be tested on its own.

export const GROUP_WINDOW_MS = 5 * 60 * 1000; // same author within 5 minutes = one block

export const dayLabel = (date) => {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

export function buildRows(messages, lastReadAt, userId) {
  const rows = [];
  let unreadDone = false;
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    if (!prev || !sameDay(prev.createdAt, m.createdAt)) rows.push({ type: 'day', key: `day-${m.id}`, date: m.createdAt });
    if (!unreadDone && lastReadAt && new Date(m.createdAt) > new Date(lastReadAt) && m.author?.id !== userId) {
      rows.push({ type: 'unread', key: `unread-${m.id}` });
      unreadDone = true;
    }
    const last = rows[rows.length - 1];
    const grouped = last?.type === 'msg'
      && last.message.author?.id === m.author?.id
      && new Date(m.createdAt) - new Date(last.message.createdAt) < GROUP_WINDOW_MS;
    rows.push({ type: 'msg', key: m.id, message: m, grouped });
  });
  return rows;
}
