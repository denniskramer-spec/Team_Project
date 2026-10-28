import { useLiveData } from '../../../useLiveData.js';

// The numbers at the top of the page: the last day and week at a glance.
export default function Overview() {
  const { data, error } = useLiveData('/security/overview');
  if (error) return <div className="alert error">{error}</div>;
  if (!data) return null;
  const tiles = [
    { value: data.last24h.logins, label: 'logins · 24h', cls: 'stat-good' },
    { value: data.last24h.failedLogins, label: 'failed logins · 24h', cls: data.last24h.failedLogins ? 'stat-bad' : '' },
    { value: data.last7d.newIpLogins, label: 'logins from new addresses · 7d', cls: data.last7d.newIpLogins ? 'role-border-boss' : '' },
    { value: data.last7d.flagged, label: 'refused or rate-limited · 7d', cls: data.last7d.flagged ? 'stat-bad' : '' },
    { value: data.last7d.loginIps, label: 'addresses used · 7d' },
    { value: data.last24h.events, label: 'events · 24h' },
    { value: data.deletedRecords, label: 'deleted records kept' },
  ];
  return (
    <div className="stat-row">
      {tiles.map((t) => (
        <div key={t.label} className={`stat ${t.cls ?? ''}`}>
          <span className="stat-value">{t.value}</span>
          <span className="muted small">{t.label}</span>
        </div>
      ))}
    </div>
  );
}
