// The team's time zone: it decides which calendar day is "today" for daily
// reports, the current week, month and year, and when a day turns over.
// Stored dates stay calendar dates (a day is its UTC midnight, as in
// period.js), so changing the zone never moves a record to another day; it
// only moves the moment "today" becomes tomorrow.
//
// The zone is kept here in memory (one process serves the app): loaded from
// the database at startup (models/Setting.js) and changed by an admin.

export const DEFAULT_TIME_ZONE = 'UTC';

// An IANA name the runtime knows ("Europe/Berlin", "America/Sao_Paulo"...).
export function isTimeZone(value) {
  if (typeof value !== 'string' || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

let zone = isTimeZone(process.env.TEAM_TIME_ZONE) ? process.env.TEAM_TIME_ZONE : DEFAULT_TIME_ZONE;
let parts = null;

export const teamTimeZone = () => zone;

export function setTeamTimeZone(value) {
  if (!isTimeZone(value)) throw new Error(`Unknown time zone: ${value}`);
  zone = value;
  parts = null;
}

// The wall clock in the team's zone at `date`, as a Date whose UTC fields
// read that wall clock (so the UTC-based period maths works on it).
export function teamNow(date = new Date()) {
  parts ??= new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(parts.formatToParts(date).map(({ type, value }) => [type, Number(value)]));
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, date.getUTCMilliseconds()));
}

// Today in the team's zone, as its calendar day (UTC midnight).
export function teamToday(date = new Date()) {
  const n = teamNow(date);
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

// The real moment the team's current day ends (its next local midnight).
// The offset is taken at that midnight, so a daylight-saving change during
// the day is accounted for.
export function teamDayEnd(date = new Date()) {
  const midnight = teamToday(date).getTime() + 86400000; // wall-clock midnight, read as UTC
  let guess = midnight - (teamNow(date).getTime() - date.getTime());
  guess = midnight - (teamNow(new Date(guess)).getTime() - guess);
  return new Date(guess);
}
