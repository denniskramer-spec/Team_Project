import { createContext, useContext, useEffect } from 'react';
import { useLiveData } from '../../useLiveData.js';
import { EVENTS } from '../../constants.js';

// Today's report status for the signed-in writer (/reports/status), loaded
// once for the whole workspace: the "Report due" corner and the side
// panel's My day read the same copy.
const ReportStatusContext = createContext(null);

export function ReportStatusProvider({ children }) {
  const live = useLiveData('/reports/status', [EVENTS.REPORT_CHANGED, EVENTS.SETTINGS_CHANGED]);
  const { data, reload } = live;
  // "Today" is a server (UTC) day: when it ends the status is due again,
  // though no event says so. Check again just after the day's end.
  useEffect(() => {
    if (!data?.end) return undefined;
    const ms = Date.parse(data.end) - Date.now();
    const id = setTimeout(reload, Math.max(ms, 0) + 1000 + Math.random() * 4000);
    return () => clearTimeout(id);
  }, [data?.end, reload]);
  return <ReportStatusContext.Provider value={live}>{children}</ReportStatusContext.Provider>;
}

// { data, error, loading, reload } of /reports/status.
export const useReportStatus = () => useContext(ReportStatusContext);
