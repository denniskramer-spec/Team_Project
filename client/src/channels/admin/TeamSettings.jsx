import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { useTeamSettings } from '../../team/TeamSettings.jsx';
import { formatDay } from '../../format.js';

// Every IANA zone the browser knows (all current browsers list them).
const ZONES = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC'];
const BROWSER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

// "14:05 · UTC+02:00" in a zone, for the picker's preview.
function clockIn(zone, at = new Date()) {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: '2-digit', minute: '2-digit', timeZoneName: 'longOffset' }).format(at);
  } catch {
    return '';
  }
}

// Admin -> Team settings: the team's time zone. It decides which day is
// "today" for daily reports, plans, Finance and Checkout, and when the day
// turns over. Records keep their dates; only "today" moves.
export default function TeamSettings() {
  const toast = useToast();
  const { data, error, reload } = useTeamSettings();
  const [zone, setZone] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data?.timeZone) setZone(data.timeZone); }, [data?.timeZone]);
  // The saved zone is always offered, even if this browser does not list it.
  const zones = useMemo(() => (data?.timeZone && !ZONES.includes(data.timeZone) ? [data.timeZone, ...ZONES] : ZONES), [data?.timeZone]);

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page muted">Loading...</div>;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/settings/time-zone', { method: 'PUT', body: { timeZone: zone } });
      toast(`Team time zone set to ${zone}`);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changed = zone && zone !== data.timeZone;
  return (
    <div className="page team-settings">
      <section className="card">
        <div className="report-section-head"><h3>Team time zone</h3></div>
        <p className="muted small">
          Decides which day is <strong>today</strong> for daily reports, plans, Finance and Checkout, and when
          the next day starts. Records keep their dates when you change it; only "today" moves.
        </p>
        <dl className="mini-stats team-zone-stats">
          <div><dt>Current zone</dt><dd>{data.timeZone}</dd></div>
          <div><dt>Team's today</dt><dd>{formatDay(data.today)}</dd></div>
          <div><dt>Day ends · your time</dt><dd>{new Date(data.dayEndsAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</dd></div>
        </dl>
        {data.canManage ? (
          <form className="form-grid team-zone-form" onSubmit={save}>
            <label>
              Time zone
              <select value={zone} onChange={(e) => setZone(e.target.value)} required>
                {zones.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </label>
            <p className="muted small form-note">
              {zone && `It is ${clockIn(zone)} there.`}
              {BROWSER_ZONE && BROWSER_ZONE !== zone && (
                <> Your browser is on {BROWSER_ZONE}. <button type="button" className="link" onClick={() => setZone(BROWSER_ZONE)}>Use it</button></>
              )}
            </p>
            <div>
              <button className="btn primary" type="submit" disabled={!changed || busy}>{busy ? 'Saving...' : 'Save time zone'}</button>
            </div>
          </form>
        ) : (
          <p className="muted small">Only admins and the team leader change it.</p>
        )}
      </section>
    </div>
  );
}
