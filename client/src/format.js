// Dates from the API are ISO strings. Birthdays are stored at UTC midnight,
// so they are formatted in UTC to avoid showing the previous day.

export function formatDate(value, { utc = false } = {}) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', ...(utc ? { timeZone: 'UTC' } : {}),
  });
}

export const formatBirthday = (value) => formatDate(value, { utc: true });
// Calendar days (task periods, income dates) are stored at UTC midnight.
export const formatDay = (value) => formatDate(value, { utc: true });

// yyyy-mm-dd for <input type="date">.
export const toDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

// Today as yyyy-mm-dd on the user's own calendar. (toISOString gives the UTC
// day, which is already tomorrow in the evening west of Greenwich and still
// yesterday in the morning east of it.)
export function todayInput() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isBirthdayToday(value) {
  if (!value) return false;
  const b = new Date(value);
  const now = new Date();
  return b.getUTCDate() === now.getDate() && b.getUTCMonth() === now.getMonth();
}

// A person's name as shown in finance and checkout. Someone who no longer
// takes part but still has records in the period carries a note saying why:
// "Tess Novak (disabled)".
export const nameOf = (person, fallback = 'Unknown') => (
  person?.name ? `${person.name}${person.note ? ` (${person.note})` : ''}` : fallback
);

// "Showing the newest 500 of 1,234" when a list was cut short, else ''.
export function shownOf(shown, total, what = 'records') {
  if (!total || shown >= total) return '';
  const n = new Intl.NumberFormat();
  return `Showing the newest ${n.format(shown)} of ${n.format(total)} ${what}. Totals and charts count all of them; pick a shorter period to list the rest.`;
}

// 1234.5 -> "1,234.5"
export const formatAmount = (n) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(n) || 0);

export function timeAgo(value) {
  if (!value) return 'never';
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  const [unit, size] = units.find(([, s]) => seconds >= s);
  const n = Math.floor(seconds / size);
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}
