import { createContext, useContext } from 'react';
import { useLiveData } from '../useLiveData.js';
import { setTeamTimeZone } from '../format.js';
import { EVENTS } from '../constants.js';

// The team-wide settings (/settings), loaded once for the workspace and
// again when an admin changes them. Today that is the team's time zone,
// which decides what "today" is everywhere in the app.
const TeamSettingsContext = createContext(null);

export function TeamSettingsProvider({ children }) {
  const live = useLiveData('/settings', [EVENTS.SETTINGS_CHANGED]);
  // Set while rendering, so the pages below already read the new "today".
  if (live.data?.timeZone) setTeamTimeZone(live.data.timeZone);
  return <TeamSettingsContext.Provider value={live}>{children}</TeamSettingsContext.Provider>;
}

// { data: { timeZone, today, dayEndsAt, canManage }, error, loading, reload }
export const useTeamSettings = () => useContext(TeamSettingsContext);
