import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useReportStatus } from '../channels/report/ReportStatus.jsx';
import { useAlerts } from './AlertsContext.jsx';
import { WRITE_REPORT_PATH } from '../constants.js';
import { formatClock } from '../format.js';
import { load, save } from '../storage.js';
import Icon from '../components/Icon.jsx';
import { notify } from './notify.js';
import { playAlert } from './sound.js';

// The period whose reminder was dismissed, so a reload does not bring it back.
const DISMISSED_KEY = 'bm.reportReminderDismissed';

// "Send your daily report": from the reminder time (Admin -> Team settings,
// a set number of minutes before the team's next day starts; none when it is
// 0) until the day ends, for
// anyone whose report for today is not sent. It rings once, when it comes up.
export default function ReportReminder() {
  const { data } = useReportStatus() ?? {};
  const { settings } = useAlerts() ?? {};
  const navigate = useNavigate();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(() => load(DISMISSED_KEY, ''));
  const [now, setNow] = useState(() => Date.now());

  const remindAt = data?.remindAt ? Date.parse(data.remindAt) : NaN;
  const end = data?.end ? Date.parse(data.end) : NaN;
  const pending = Boolean(data?.canWrite && data.due && dismissed !== data.period);
  const active = pending && now >= remindAt && now < end;

  // Wake up at the reminder time (and at the day's end, to hide it).
  useEffect(() => {
    if (!pending) return undefined;
    const next = [remindAt, end].find((t) => t > now);
    if (next === undefined) return undefined;
    // Long timers are clamped by browsers; check again at most hourly.
    const id = setTimeout(() => setNow(Date.now()), Math.min(next - now + 250, 3_600_000));
    return () => clearTimeout(id);
  }, [pending, remindAt, end, now]);

  // Ring once per day when it comes up.
  useEffect(() => {
    if (!active) return;
    const key = `bm.reportReminderRang.${data.period}`;
    if (load(key, false)) return;
    save(key, true);
    if (settings?.sound) playAlert();
    if (settings?.desktop) {
      notify(titleOf(data), { body: bodyOf(data), tag: `report-reminder-${data.period}`, requireInteraction: true }, () => navigate(WRITE_REPORT_PATH));
    }
  }, [active, data, settings, navigate]);

  if (!active || location.search.includes('write=1')) return null;
  const dismiss = () => { save(DISMISSED_KEY, data.period); setDismissed(data.period); };
  return (
    <div className="report-reminder" aria-live="assertive">
      <div className="chat-popup report-reminder-card" role="alert">
        <button type="button" className="chat-popup-main" onClick={() => navigate(WRITE_REPORT_PATH)} title="Write the daily report">
          <span className="report-reminder-icon"><Icon name="file" size={18} /></span>
          <span className="chat-popup-text">
            <span className="chat-popup-head"><span className="strong">{titleOf(data)}</span></span>
            <span className="chat-popup-content">{bodyOf(data)}</span>
          </span>
        </button>
        <button type="button" className="icon-btn chat-popup-close" onClick={dismiss} aria-label="Dismiss"><Icon name="close" size={14} /></button>
      </div>
    </div>
  );
}

const titleOf = (data) => `Send your daily report by ${formatClock(data.end)}`;

function bodyOf(data) {
  return `${data.draft ? 'Your draft is not sent yet.' : 'It is not written yet.'} The next day starts then.`;
}
