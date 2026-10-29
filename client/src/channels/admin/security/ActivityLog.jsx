import { useEffect, useState } from 'react';
import { useDebounced } from '../../../useLiveData.js';
import { timeAgo } from '../../../format.js';
import Icon from '../../../components/Icon.jsx';
import { useSort, Th } from '../../../components/SortTable.jsx';
import { KIND_LABELS, OPS, actionLabel, device, when, show, whoOf } from './labels.js';
import Who from './Who.jsx';
import { usePagedList } from './usePagedList.js';

// The security log: everything is recorded, only the dangerous entries are
// listed (the server decides which), newest first, 100 at a time,
// filterable by kind and text, exportable.

const LOG_COLUMNS = {
  when: { by: (e) => e.at, desc: true },
  who: (e) => whoOf(e.user, e.username),
  what: (e) => actionLabel(e.action),
  address: (e) => e.ip ?? null,
  device: (e) => device(e.userAgent, e.method) || null,
  result: (e) => e.status,
};

function Result({ status, flags }) {
  const cls = status >= 500 ? 'disabled' : status === 429 ? 'pending' : status === 401 || status === 403 ? 'disabled' : status >= 400 ? 'pending' : 'active';
  const text = status === 429 ? 'rate limited' : status === 401 || status === 403 ? 'denied' : status >= 400 ? `error ${status}` : 'ok';
  return (
    <span className="log-result">
      <span className={`status-pill ${cls}`}>{text}</span>
      {flags?.includes('new-ip') && <span className="status-pill pending" title="First login from this address">new address</span>}
      {flags?.includes('outside-app') && <span className="status-pill disabled" title="Done on the database directly, not through the app">outside app</span>}
      {flags?.includes('tamper') && <span className="status-pill disabled" title="The security log, the kept copies or the recording itself were touched">tampering</span>}
    </span>
  );
}

// What the request did to the data: each record added, edited (field by
// field, old value → new value) or deleted.
function Changes({ changes, more }) {
  return (
    <ul className="log-changes">
      {changes.map((c, i) => (
        <li key={`${c.id}-${i}`} className="log-change">
          <div className="log-change-head">
            <span className={`status-pill ${c.op === 'delete' ? 'disabled' : c.op === 'create' ? 'active' : 'pending'}`}>{OPS[c.op] ?? c.op}</span>
            <span className="strong">{c.model}</span>
            <span>{c.label || ''}</span>
            <span className="muted small">· {String(c.id)}</span>
            {c.reason && <span className="muted small">· {c.reason}</span>}
          </div>
          {c.fields && (
            <table className="log-diff">
              <tbody>
                {Object.entries(c.fields).map(([field, { from, to }]) => (
                  <tr key={field}><th>{field}</th><td className="log-from">{show(from)}</td><td className="log-to">{show(to)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </li>
      ))}
      {more > 0 && <li className="muted small">… and {more} more records</li>}
    </ul>
  );
}

function Details({ entry }) {
  const { changes, moreChanges, ...rest } = entry.details && typeof entry.details === 'object' && !Array.isArray(entry.details) ? entry.details : { changes: null };
  const other = changes ? rest : entry.details;
  return (
    <div className="log-details">
      <dl>
        <dt>Request</dt><dd><code>{entry.method} {entry.path}</code> · {entry.status} · {entry.durationMs} ms</dd>
        {entry.target && <><dt>Record</dt><dd>{entry.target.model ? `${entry.target.model} ` : ''}{entry.target.label || ''}{entry.target.id ? <span className="muted small"> · {String(entry.target.id)}</span> : null}</dd></>}
        <dt>Address</dt><dd>{entry.ip || '—'}</dd>
        <dt>Device</dt><dd className="muted small">{entry.userAgent || '—'}</dd>
        {entry.flags?.length > 0 && <><dt>Flags</dt><dd>{entry.flags.join(', ')}</dd></>}
      </dl>
      {changes?.length > 0 && <Changes changes={changes} more={moreChanges} />}
      {other && Object.keys(other).length > 0 && <pre>{JSON.stringify(other, null, 2)}</pre>}
    </div>
  );
}

function LogRow({ entry, open, onToggle }) {
  const flagged = entry.flags?.some((f) => ['new-ip', 'rate-limited', 'denied'].includes(f));
  const outside = entry.flags?.includes('outside-app');
  return (
    <>
      <tr className={`log-row ${flagged ? 'is-flagged' : ''} ${outside ? 'is-outside' : ''} ${open ? 'is-open' : ''}`} onClick={onToggle}>
        <td data-label="When"><span className="log-when">{when(entry.at)}</span><span className="muted small"> · {timeAgo(entry.at)}</span></td>
        <td data-label="Who"><Who user={entry.user} username={entry.username} outside={outside} /></td>
        <td data-label="What">
          <div className="strong">{actionLabel(entry.action)}</div>
          <div className="muted small">{entry.target?.label || entry.details?.of || entry.path}</div>
        </td>
        <td data-label="Address"><code className="log-ip">{entry.ip || '—'}</code></td>
        <td data-label="Device" className="muted small" title={entry.userAgent}>{device(entry.userAgent, entry.method)}</td>
        <td data-label="Result"><Result status={entry.status} flags={entry.flags} /></td>
      </tr>
      {open && <tr className="log-row-details"><td colSpan={6}><Details entry={entry} /></td></tr>}
    </>
  );
}

export default function ActivityLog() {
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  const [open, setOpen] = useState(null);

  // The filter as query parameters: the same for the list and the CSV export.
  const withFilter = (params) => {
    if (kind !== 'all') params.set('kind', kind);
    if (query) params.set('q', query);
    return params;
  };
  const { rows: entries, hasMore, loading, error, load } = usePagedList((p) => `/security/log?${withFilter(p)}`, [kind, query], 'entries');
  const sorter = useSort(entries, LOG_COLUMNS);
  useEffect(() => { setOpen(null); }, [kind, query]);
  const exportHref = `/api/security/log.csv?${withFilter(new URLSearchParams())}`;

  return (
    <section className="card security-card">
      <div className="toolbar">
        <div className="page-title">
          <h3>Security log</h3>
          <span className="muted small">Only what is dangerous: anything done on the database directly, outside the app (a tool such as MongoChef, a shell), deletions and restores, failed logins and refused requests, and changes to accounts and access (roles, disabling, passwords, ended sessions, exports). Who, when, from which address and program, what it touched and which fields went from what to what. Everything else is still recorded, just not shown. Nothing here can be edited or removed.</span>
        </div>
      </div>
      <div className="toolbar security-filters">
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Show">
          {Object.entries(KIND_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <div className="search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, username, address, path…" aria-label="Search the log" />
        </div>
        <span className="toolbar-right log-actions">
          <button type="button" className="btn small-btn" onClick={() => load(false)} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
          <a className="btn small-btn" href={exportHref} download>Export CSV</a>
        </span>
      </div>
      {error && <div className="alert error">{error}</div>}
      {!entries.length && !loading && !error && <div className="empty-inline muted"><Icon name="shield" size={20} /> Nothing dangerous for this filter.</div>}
      {entries.length > 0 && (
        <table className="table log-table">
          <thead>
            <tr>
              <Th sort={sorter} col="when">When</Th>
              <Th sort={sorter} col="who">Who</Th>
              <Th sort={sorter} col="what">What</Th>
              <Th sort={sorter} col="address">Address</Th>
              <Th sort={sorter} col="device">Device</Th>
              <Th sort={sorter} col="result">Result</Th>
            </tr>
          </thead>
          <tbody>
            {sorter.rows.map((e) => (
              <LogRow key={e.id} entry={e} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />
            ))}
          </tbody>
        </table>
      )}
      {hasMore && <button type="button" className="btn load-more" onClick={() => load(true)} disabled={loading}>Load older</button>}
    </section>
  );
}
