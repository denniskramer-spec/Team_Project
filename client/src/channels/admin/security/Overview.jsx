import { useLiveData } from '../../../useLiveData.js';

// The numbers at the top of the page: the last day and week at a glance.
export default function Overview() {
  const { data, error } = useLiveData('/security/overview');
  if (error) return <div className="alert error">{error}</div>;
  if (!data) return null;
  const watch = data.outsideWatch;
  const tiles = [
    { value: data.last7d.outside, label: `outside the app · 7d${data.last7d.outsideWrites ? ` · ${data.last7d.outsideWrites} changes` : ''}`, cls: data.last7d.outsideWrites ? 'stat-bad' : data.last7d.outside ? 'role-border-boss' : '' },
    { value: data.last24h.logins, label: 'logins · 24h', cls: 'stat-good' },
    { value: data.last24h.failedLogins, label: 'failed logins · 24h', cls: data.last24h.failedLogins ? 'stat-bad' : '' },
    { value: data.last7d.newIpLogins, label: 'logins from new addresses · 7d', cls: data.last7d.newIpLogins ? 'role-border-boss' : '' },
    { value: data.last7d.flagged, label: 'refused or rate-limited · 7d', cls: data.last7d.flagged ? 'stat-bad' : '' },
    { value: data.last7d.loginIps, label: 'addresses used · 7d' },
    { value: data.last24h.events, label: 'events · 24h' },
    { value: data.deletedRecords, label: 'deleted records kept' },
  ];
  return (
    <>
      <div className="stat-row">
        {tiles.map((t) => (
          <div key={t.label} className={`stat ${t.cls ?? ''}`}>
            <span className="stat-value">{t.value}</span>
            <span className="muted small">{t.label}</span>
          </div>
        ))}
      </div>
      {/* Say so when part of the outside-the-app recording cannot run. */}
      {watch && (watch.profiler !== 'on' || watch.deletes !== 'on') && (
        <div className="alert warning outside-watch-note">
          Recording of database access outside the app:
          {' '}access {watch.profiler === 'on' ? 'on' : 'off'} · copies of deleted records {watch.deletes === 'on' ? 'on' : 'off'}.
          {watch.note && <> {watch.note}</>}
        </div>
      )}
    </>
  );
}
