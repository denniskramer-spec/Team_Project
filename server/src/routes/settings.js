import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { badRequest, forbidden } from '../utils/httpError.js';
import Setting from '../models/Setting.js';
import {
  MAX_REMINDER_MINUTES, isDayStart, isReminderMinutes, isTimeZone, setTeamDayStart,
  setTeamReminderMinutes, setTeamTimeZone, teamDayEnd, teamDayStart, teamReminderMinutes,
  teamReportReminder, teamTimeZone, teamToday,
} from '../utils/teamTime.js';
import { settingsChanged } from '../socket/events.js';

// Team-wide settings. Everyone reads them (the client shows "today" in the
// team's zone); admins and the team leader change them.
const router = Router();
router.use(requireAuth);

const canManage = (user) => ['admin', 'leader'].includes(user.role);

const current = (user) => ({
  timeZone: teamTimeZone(),
  today: teamToday().toISOString().slice(0, 10),
  dayStart: teamDayStart(),
  dayEndsAt: teamDayEnd(),
  reminderAt: teamReportReminder(),
  reminderMinutes: teamReminderMinutes(),
  canManage: canManage(user),
});

// Startup: the saved zone (otherwise TEAM_TIME_ZONE or UTC), day start
// (otherwise midnight) and report reminder (otherwise 30 minutes).
export async function loadSettings() {
  const saved = await Setting.find({ key: { $in: ['timeZone', 'dayStart', 'reminderMinutes'] } }).lean();
  const value = (key) => saved.find((s) => s.key === key)?.value;
  if (isTimeZone(value('timeZone'))) setTeamTimeZone(value('timeZone'));
  if (isDayStart(value('dayStart'))) setTeamDayStart(value('dayStart'));
  if (isReminderMinutes(value('reminderMinutes'))) setTeamReminderMinutes(value('reminderMinutes'));
}

const save = (key, value, user) => Setting.findOneAndUpdate(
  { key },
  { value, updatedBy: user._id },
  { upsert: true, new: true, setDefaultsOnInsert: true },
);

router.get('/', (req, res) => {
  res.json(current(req.user));
});

// PUT /api/settings/time-zone { timeZone } — an IANA name.
router.put('/time-zone', async (req, res) => {
  if (!canManage(req.user)) throw forbidden('Only admins and the team leader change the team time zone');
  const { timeZone } = req.body ?? {};
  if (!isTimeZone(timeZone)) throw badRequest('Choose a time zone from the list');
  await save('timeZone', timeZone, req.user);
  setTeamTimeZone(timeZone);
  // "Today" may now be another day for every open page.
  settingsChanged();
  res.json(current(req.user));
});

// PUT /api/settings/day-start { dayStart?, reminderMinutes? }
//   dayStart         "HH:MM" on the team's clock: when one day turns into the next
//   reminderMinutes  how long before that an unsent daily report alerts (0 = never)
router.put('/day-start', async (req, res) => {
  if (!canManage(req.user)) throw forbidden('Only admins and the team leader change when the day starts');
  const { dayStart, reminderMinutes } = req.body ?? {};
  if (dayStart === undefined && reminderMinutes === undefined) throw badRequest('Nothing to change');
  if (dayStart !== undefined && !isDayStart(dayStart)) throw badRequest('Give the time as HH:MM, for example 06:00');
  if (reminderMinutes !== undefined && !isReminderMinutes(reminderMinutes)) {
    throw badRequest(`The reminder is a whole number of minutes from 0 to ${MAX_REMINDER_MINUTES}`);
  }
  if (dayStart !== undefined) {
    await save('dayStart', dayStart, req.user);
    setTeamDayStart(dayStart);
  }
  if (reminderMinutes !== undefined) {
    await save('reminderMinutes', reminderMinutes, req.user);
    setTeamReminderMinutes(reminderMinutes);
  }
  settingsChanged();
  res.json(current(req.user));
});

export default router;
