import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { badRequest, forbidden } from '../utils/httpError.js';
import Setting from '../models/Setting.js';
import { isTimeZone, setTeamTimeZone, teamDayEnd, teamTimeZone, teamToday } from '../utils/teamTime.js';
import { settingsChanged } from '../socket/events.js';

// Team-wide settings. Everyone reads them (the client shows "today" in the
// team's zone); admins and the team leader change them.
const router = Router();
router.use(requireAuth);

const canManage = (user) => ['admin', 'leader'].includes(user.role);

const current = (user) => ({
  timeZone: teamTimeZone(),
  today: teamToday().toISOString().slice(0, 10),
  dayEndsAt: teamDayEnd(),
  canManage: canManage(user),
});

// Startup: the saved zone, if one was saved (otherwise TEAM_TIME_ZONE or UTC).
export async function loadSettings() {
  const saved = await Setting.findOne({ key: 'timeZone' }).lean();
  if (saved && isTimeZone(saved.value)) setTeamTimeZone(saved.value);
}

router.get('/', (req, res) => {
  res.json(current(req.user));
});

// PUT /api/settings/time-zone { timeZone } — an IANA name.
router.put('/time-zone', async (req, res) => {
  if (!canManage(req.user)) throw forbidden('Only admins and the team leader change the team time zone');
  const { timeZone } = req.body ?? {};
  if (!isTimeZone(timeZone)) throw badRequest('Choose a time zone from the list');
  await Setting.findOneAndUpdate(
    { key: 'timeZone' },
    { value: timeZone, updatedBy: req.user._id },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  setTeamTimeZone(timeZone);
  // "Today" may now be another day for every open page.
  settingsChanged();
  res.json(current(req.user));
});

export default router;
