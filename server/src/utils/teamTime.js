// The team's time zone: it decides which calendar day is "today" for daily
// reports, the current week, month and year, and when a day turns over.
// Stored dates stay calendar dates (a day is its UTC midnight, as in
// period.js), so changing the zone never moves a record to another day; it
// only moves the moment "today" becomes tomorrow.
//
// The team's day may start later than midnight (Admin -> Team settings,
// "Day starts at"): with 06:00, 03:00 on Tuesday still belongs to Monday, and
// Monday turns into Tuesday at 06:00. Members are reminded to send the daily
// report a set number of minutes before that (default 30, 0 = no reminder).
//
// Both are kept here in memory (one process serves the app): loaded from the
// database at startup (models/Setting.js) and changed by an admin.

export const DEFAULT_TIME_ZONE = 'UTC';
export const DEFAULT_DAY_START = '00:00';
export const DEFAULT_REMINDER_MINUTES = 30;
export const MAX_REMINDER_MINUTES = 720;

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
let dayStartMs = 0;
let reminderMinutes = DEFAULT_REMINDER_MINUTES;

// Whole minutes before the day ends, 0 (no reminder) to 12 hours.
export const isReminderMinutes = (value) => Number.isInteger(value) && value >= 0 && value <= MAX_REMINDER_MINUTES;

export const teamReminderMinutes = () => reminderMinutes;

export function setTeamReminderMinutes(value) {
  if (!isReminderMinutes(value)) throw new Error(`Not a reminder time: ${value}`);
  reminderMinutes = value;
}

// "HH:MM", 24-hour clock.
export function isDayStart(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export const teamTimeZone = () => zone;

export function teamDayStart() {
  const minutes = dayStartMs / 60000;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function setTeamDayStart(value) {
  if (!isDayStart(value)) throw new Error(`Not a time of day: ${value}`);
  const [h, m] = value.split(':').map(Number);
  dayStartMs = (h * 60 + m) * 60000;
}

export function setTeamTimeZone(value) {
  if (!isTimeZone(value)) throw new Error(`Unknown time zone: ${value}`);
  zone = value;
  parts = null;
}

// The wall clock in the team's zone at `date`, as a Date whose UTC fields
// read that wall clock.
function wallClock(date) {
  parts ??= new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(parts.formatToParts(date).map(({ type, value }) => [type, Number(value)]));
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, date.getUTCMilliseconds()));
}

// The team's clock at `date`: the wall clock moved back by the day's start,
// so its calendar day is the team's day (the UTC-based period maths works
// on it). With the day starting at midnight it is the wall clock itself.
export function teamNow(date = new Date()) {
  return new Date(wallClock(date).getTime() - dayStartMs);
}

// Today in the team's zone, as its calendar day (UTC midnight).
export function teamToday(date = new Date()) {
  const n = teamNow(date);
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

// The real moment the team's current day ends: the next day's start on the
// local wall clock. The offset is taken at that moment, so a daylight-saving
// change during the day is accounted for.
export function teamDayEnd(date = new Date()) {
  const end = teamToday(date).getTime() + 86400000 + dayStartMs; // wall clock, read as UTC
  let guess = end - (wallClock(date).getTime() - date.getTime());
  guess = end - (wallClock(new Date(guess)).getTime() - guess);
  return new Date(guess);
}

// When members are reminded to send today's report (null: no reminder).
export const teamReportReminder = (date = new Date()) => (
  reminderMinutes ? new Date(teamDayEnd(date).getTime() - reminderMinutes * 60000) : null
);
