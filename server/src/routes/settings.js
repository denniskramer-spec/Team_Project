import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { badRequest, forbidden } from '../utils/httpError.js';
import Setting from '../models/Setting.js';
import {
  REPORT_REMINDER_MINUTES, isDayStart, isTimeZone, setTeamDayStart, setTeamTimeZone,
  teamDayEnd, teamDayStart, teamReportReminder, teamTimeZone, teamToday,
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
  reminderMinutes: REPORT_REMINDER_MINUTES,
  canManage: canManage(user),
});

// Startup: the saved zone (otherwise TEAM_TIME_ZONE or UTC) and day start
// (otherwise midnight).
export async function loadSettings() {
  const saved = await Setting.find({ key: { $in: ['timeZone', 'dayStart'] } }).lean();
  const value = (key) => saved.find((s) => s.key === key)?.value;
  if (isTimeZone(value('timeZone'))) setTeamTimeZone(value('timeZone'));
  if (isDayStart(value('dayStart'))) setTeamDayStart(value('dayStart'));
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

// PUT /api/settings/day-start { dayStart } — "HH:MM" on the team's clock:
// when one day turns into the next. The report reminder moves with it.
router.put('/day-start', async (req, res) => {
  if (!canManage(req.user)) throw forbidden('Only admins and the team leader change when the day starts');
  const { dayStart } = req.body ?? {};
  if (!isDayStart(dayStart)) throw badRequest('Give the time as HH:MM, for example 06:00');
  await save('dayStart', dayStart, req.user);
  setTeamDayStart(dayStart);
  settingsChanged();
  res.json(current(req.user));
});

export default router;
