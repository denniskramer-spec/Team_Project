// Dates from the API are ISO strings. Birthdays are stored at UTC midnight,
// so they are formatted in UTC to avoid showing the previous day.

// Short numeric date in the browser's own order: 23/11/1989 in Portugal or
// the UK, 11/23/1989 in the US.
export function formatDate(value, { utc = false } = {}) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    day: '2-digit', month: '2-digit', year: 'numeric', ...(utc ? { timeZone: 'UTC' } : {}),
  });
}

export const formatBirthday = (value) => formatDate(value, { utc: true });
// Calendar days (task periods, income dates) are stored at UTC midnight.
export const formatDay = (value) => formatDate(value, { utc: true });

// yyyy-mm-dd for <input type="date">.
export const toDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

// The team's time zone and the time its day starts (Admin -> Team
// settings), once known; until then the browser's own zone and midnight.
// Set by TeamSettingsProvider.
let teamZone = null;
let teamClock = null;
let dayStartMs = 0;
export function setTeamDay(zone, dayStart = '00:00') {
  const [h, m] = /^\d\d:\d\d$/.test(dayStart ?? '') ? dayStart.split(':').map(Number) : [0, 0];
  dayStartMs = (h * 60 + m) * 60000;
  if (zone === teamZone) return;
  teamZone = zone || null;
  teamClock = teamZone
    ? new Intl.DateTimeFormat('en-US', { timeZone: teamZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;
}

// Today as yyyy-mm-dd on the team's calendar, the same day the server calls
// today: the wall clock in the team's zone, moved back by the day's start
// (with the day starting at 06:00, 03:00 is still yesterday). toISOString
// alone would give the UTC day.
export function todayInput() {
  const now = new Date();
  let wall;
  if (teamClock) {
    const p = Object.fromEntries(teamClock.formatToParts(now).map(({ type, value }) => [type, Number(value)]));
    wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  } else {
    wall = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
  }
  return new Date(wall - dayStartMs).toISOString().slice(0, 10);
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
// "1,234" for a whole amount, "1,234.50" when it has cents: never "1,234.5".
const WHOLE = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const CENTS = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Hours and other quantities: "3.5", "12".
export const formatNumber = (n) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(n) || 0);
export const formatAmount = (n) => {
  const value = Math.round((Number(n) || 0) * 100) / 100;
  return (Number.isInteger(value) ? WHOLE : CENTS).format(value);
};

// "09:05" / "9:05 AM" in the browser's own convention, for message times,
// report timestamps and the footer clock.
export const formatClock = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function timeAgo(value) {
  if (!value) return 'never';
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  const [unit, size] = units.find(([, s]) => seconds >= s);
  const n = Math.floor(seconds / size);
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}
