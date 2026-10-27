import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useDebounced } from '../../useLiveData.js';
import { useToast } from '../../components/Toast.jsx';
import { timeAgo } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';

// Admin → Security: who did what, when and from where. Three parts: the
// numbers for the last day and week, the security log itself (every login,
// every look at the data and every change with the fields that changed,
// filterable and exportable), and the records people deleted, kept whole
// and restorable. Plus the means to end an account's sessions.

const KIND_LABELS = {
  all: 'Everything', view: 'Views', change: 'Changes', delete: 'Deletions', restore: 'Restores', login: 'Logins', failed: 'Failed & refused', admin: 'Admin actions', flagged: 'Flagged',
};
const VERBS = {
  create: 'Added', update: 'Edited', delete: 'Deleted', approve: 'Approved', reject: 'Rejected', upload: 'Uploaded to',
  refresh: 'Refreshed', role: 'Changed role via', group: 'Moved group via', disable: 'Disabled via', enable: 'Enabled via',
  'reset-password': 'Reset password via', read: 'Read', send: 'Sent', nudge: 'Reminded via', 'sign-out': 'Ended sessions via',
  export: 'Exported', view: 'Viewed', restate: 'Re-stated', status: 'Set status via',
};
const FIXED = {
  'auth.login': 'Logged in', 'auth.login.failed': 'Login failed', 'auth.logout': 'Logged out', 'auth.password': 'Changed password',
  'auth.signup': 'Signed up', 'auth.profile': 'Edited profile', 'security.export': 'Exported the security log',
  'security.deleted.view': 'Opened a deleted record', 'security.sign-out': 'Ended sessions of', 'finance.rates.refresh': 'Refreshed exchange rates',
  'security.restore': 'Restored a deleted record', 'security.view': 'Viewed the security log', 'checkout.view': 'Viewed checkout', 'finance.view': 'Viewed finance totals',
};
const RESOURCES = {
  incomes: 'income', outcomes: 'outcome', tasks: 'project', residents: 'resident', 'chat-accounts': 'chat account', members: 'member',
  groups: 'group', reports: 'report', plans: 'plan', instructions: 'instruction', chat: 'message', payments: 'payment fee', users: 'user',
};
const PLURAL = {
  incomes: 'incomes', outcomes: 'outcomes', tasks: 'projects', residents: 'residents', 'chat-accounts': 'chat accounts', members: 'members',
  groups: 'groups', reports: 'reports', plans: 'plans', instructions: 'instructions', chat: 'messages', payments: 'payment fees', users: 'users',
};
const OPS = { create: 'Added', update: 'Edited', delete: 'Deleted' };

function actionLabel(action = '') {
  if (FIXED[action]) return FIXED[action];
  const failed = action.endsWith('.failed');
  const [resource, verb] = (failed ? action.slice(0, -7) : action).split('.');
  const what = (verb === 'view' ? PLURAL[resource] : RESOURCES[resource]) ?? resource;
  const label = `${VERBS[verb] ?? verb} ${what}`;
  return failed ? `${label} (refused)` : label;
}

// "Chrome · Linux" from a browser's user-agent string.
function device(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ua ? 'Other' : '—';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

const when = (value) => new Date(value).toLocaleString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

function Result({ status, flags }) {
  const cls = status >= 500 ? 'disabled' : status === 429 ? 'pending' : status === 401 || status === 403 ? 'disabled' : status >= 400 ? 'pending' : 'active';
  const text = status === 429 ? 'rate limited' : status === 401 || status === 403 ? 'denied' : status >= 400 ? `error ${status}` : 'ok';
  return (
    <span className="log-result">
      <span className={`status-pill ${cls}`}>{text}</span>
      {flags?.includes('new-ip') && <span className="status-pill pending" title="First login from this address">new address</span>}
    </span>
  );
}

function Who({ user, username }) {
  if (!user) return <span className="muted">{username ? `@${username}` : 'anonymous'}</span>;
  return (
    <span className="cell-user">
      <Avatar name={user.name} role={user.role} size={22} />
      <span><span className="strong">{user.name}</span> <span className="muted small">@{user.username}</span></span>
    </span>
  );
}

function Overview() {
  const [data, setData] = useState(null);
  useEffect(() => { api('/security/overview').then(setData).catch(() => setData(null)); }, []);
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

const show = (v) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

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

// Every login and every change, newest first, 100 at a time.
function ActivityLog() {
  const toast = useToast();
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  const [entries, setEntries] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);

  const params = useCallback((more) => {
    const p = new URLSearchParams();
    if (kind !== 'all') p.set('kind', kind);
    if (query) p.set('q', query);
    if (more && cursor) { p.set('before', cursor.before); p.set('beforeId', cursor.beforeId); }
    return p.toString();
  }, [kind, query, cursor]);

  const load = useCallback(async (more = false) => {
    setLoading(true);
    try {
      const d = await api(`/security/log?${params(more)}`);
      setEntries((prev) => (more ? [...prev, ...d.entries] : d.entries));
      setCursor(d.cursor);
      setHasMore(d.hasMore);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [params, toast]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setOpen(null); load(false); }, [kind, query]);

  const exportHref = `/api/security/log.csv?${params(false)}`;

  return (
    <section className="card security-card">
      <div className="toolbar">
        <div className="page-title">
          <h3>Security log</h3>
          <span className="muted small">Every login, every look at the data and every change: who, when, from which address and device, what it touched and which fields went from what to what. Nothing here can be edited or removed.</span>
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
      {!entries.length && !loading && <div className="empty-inline muted"><Icon name="shield" size={20} /> Nothing in the log for this filter yet.</div>}
      {entries.length > 0 && (
        <table className="table log-table">
          <thead>
            <tr><th>When</th><th>Who</th><th>What</th><th>Address</th><th>Device</th><th>Result</th></tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <LogRow key={e.id} entry={e} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />
            ))}
          </tbody>
        </table>
      )}
      {hasMore && <button type="button" className="btn load-more" onClick={() => load(true)} disabled={loading}>Load older</button>}
    </section>
  );
}

function LogRow({ entry, open, onToggle }) {
  const flagged = entry.flags?.some((f) => ['new-ip', 'rate-limited', 'denied'].includes(f));
  return (
    <>
      <tr className={`log-row ${flagged ? 'is-flagged' : ''} ${open ? 'is-open' : ''}`} onClick={onToggle}>
        <td data-label="When"><span className="log-when">{when(entry.at)}</span><span className="muted small"> · {timeAgo(entry.at)}</span></td>
        <td data-label="Who"><Who user={entry.user} username={entry.username} /></td>
        <td data-label="What">
          <div className="strong">{actionLabel(entry.action)}</div>
          <div className="muted small">{entry.target?.label || entry.details?.of || entry.path}</div>
        </td>
        <td data-label="Address"><code className="log-ip">{entry.ip || '—'}</code></td>
        <td data-label="Device" className="muted small" title={entry.userAgent}>{device(entry.userAgent)}</td>
        <td data-label="Result"><Result status={entry.status} flags={entry.flags} /></td>
      </tr>
      {open && <tr className="log-row-details"><td colSpan={6}><Details entry={entry} /></td></tr>}
    </>
  );
}

// What was deleted, and the record itself on request.
function DeletedRecords() {
  const toast = useToast();
  const [model, setModel] = useState('');
  const [state, setState] = useState('gone');
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  const [data, setData] = useState({ records: [], models: [], hasMore: false, cursor: null });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [snapshot, setSnapshot] = useState({});

  const load = useCallback(async (more = false) => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (model) p.set('model', model);
      if (state) p.set('state', state);
      if (query) p.set('q', query);
      if (more && data.cursor) { p.set('before', data.cursor.before); p.set('beforeId', data.cursor.beforeId); }
      const d = await api(`/security/deleted?${p}`);
      setData((prev) => ({ ...d, records: more ? [...prev.records, ...d.records] : d.records }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [model, state, query, data.cursor, toast]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setOpen(null); load(false); }, [model, state, query]);

  const restore = async (id) => {
    try {
      const { record } = await api(`/security/deleted/${id}/restore`, { method: 'POST' });
      setData((d) => ({ ...d, records: d.records.map((r) => (r.id === id ? { ...r, ...record } : r)) }));
      toast(`${record.model} "${record.label || record.recordId}" is back`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const show = async (id) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (snapshot[id]) return undefined;
    try {
      const { record } = await api(`/security/deleted/${id}`);
      setSnapshot((s) => ({ ...s, [id]: record.snapshot }));
    } catch (err) {
      toast.error(err.message);
    }
    return undefined;
  };

  return (
    <section className="card security-card">
      <div className="toolbar">
        <div className="page-title">
          <h3>Deleted records</h3>
          <span className="muted small">Everything anyone deletes is kept here whole, with who removed it and from where. Its images stay too. A record can be put back exactly as it was; opening or restoring one is written to the log.</span>
        </div>
      </div>
      <div className="toolbar security-filters">
        <select value={state} onChange={(e) => setState(e.target.value)} aria-label="State">
          <option value="gone">Still deleted</option>
          <option value="restored">Restored</option>
          <option value="">Both</option>
        </select>
        <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Type">
          <option value="">All types</option>
          {data.models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <div className="search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Record, who deleted it, address…" aria-label="Search deleted records" />
        </div>
        <button type="button" className="btn small-btn toolbar-right" onClick={() => load(false)} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      {!data.records.length && !loading && <div className="empty-inline muted"><Icon name="trash" size={20} /> {state === 'restored' ? 'Nothing has been restored.' : 'Nothing has been deleted.'}</div>}
      {data.records.length > 0 && (
        <table className="table log-table">
          <thead><tr><th>When</th><th>Deleted by</th><th>Type</th><th>Record</th><th>Address</th><th aria-label="Open" /></tr></thead>
          <tbody>
            {data.records.map((r) => (
              <RecordRow key={r.id} record={r} open={open === r.id} snapshot={snapshot[r.id]} onToggle={() => show(r.id)} onRestore={() => restore(r.id)} />
            ))}
          </tbody>
        </table>
      )}
      {data.hasMore && <button type="button" className="btn load-more" onClick={() => load(true)} disabled={loading}>Load older</button>}
    </section>
  );
}

function RecordRow({ record, open, snapshot, onToggle, onRestore }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const restore = async (e) => {
    e.stopPropagation();
    setBusy(true);
    await onRestore();
    setBusy(false);
    setConfirm(false);
  };
  return (
    <>
      <tr className={`log-row ${open ? 'is-open' : ''}`} onClick={onToggle}>
        <td data-label="When"><span className="log-when">{when(record.deletedAt)}</span><span className="muted small"> · {timeAgo(record.deletedAt)}</span></td>
        <td data-label="Deleted by"><Who user={record.deletedBy} /></td>
        <td data-label="Type"><span className="status-pill pending">{record.model}</span></td>
        <td data-label="Record">
          <div className="strong">{record.label || String(record.recordId)}</div>
          {record.reason && <div className="muted small">{record.reason}</div>}
          {record.restoredAt && <div className="small"><span className="status-pill active">restored</span> <span className="muted">by {record.restoredBy?.name ?? 'someone'} · {timeAgo(record.restoredAt)}</span></div>}
        </td>
        <td data-label="Address"><code className="log-ip">{record.ip || '—'}</code></td>
        <td className="cell-actions"><Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} /></td>
      </tr>
      {open && (
        <tr className="log-row-details">
          <td colSpan={6}>
            <div className="log-details">
              <div className="log-actions">
                {record.restoredAt
                  ? <span className="muted small">Put back by {record.restoredBy?.name ?? 'someone'} on {when(record.restoredAt)}.</span>
                  : !confirm
                    ? <button type="button" className="btn small-btn" onClick={(e) => { e.stopPropagation(); setConfirm(true); }}>Restore this {record.model}</button>
                    : (
                      <>
                        <span className="small">Put this {record.model} back exactly as it was?</span>
                        <button type="button" className="btn primary small-btn" onClick={restore} disabled={busy}>{busy ? 'Restoring…' : 'Yes, restore'}</button>
                        <button type="button" className="btn small-btn" onClick={(e) => { e.stopPropagation(); setConfirm(false); }} disabled={busy}>Cancel</button>
                      </>
                    )}
              </div>
              {record.files?.length > 0 && (
                <ul className="image-thumbs small-thumbs" aria-label="Images">
                  {record.files.map((f) => <li key={f}><a href={`/api/files/${f}`} target="_blank" rel="noreferrer"><img src={`/api/files/${f}`} alt={f} loading="lazy" /></a></li>)}
                </ul>
              )}
              <pre>{snapshot ? JSON.stringify(snapshot, null, 2) : 'Loading…'}</pre>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Ends every session of one account, on every device.
function Sessions() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [user, setUser] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/users/directory').then((d) => setUsers(d.users)).catch(() => setUsers([])); }, []);

  const end = async () => {
    setBusy(true);
    try {
      const r = await api(`/security/users/${user}/sign-out`, { method: 'POST' });
      toast(`${r.user.name} has been signed out everywhere`);
      setConfirm(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  const picked = users.find((u) => u.id === user);

  return (
    <section className="card security-card">
      <div className="page-title">
        <h3>Sessions</h3>
        <span className="muted small">If an account may be in the wrong hands, end its sessions: every device is logged out at once and only the password gets back in. Pair it with a password reset from Users &amp; roles.</span>
      </div>
      <div className="toolbar sessions-row">
        <select value={user} onChange={(e) => { setUser(e.target.value); setConfirm(false); }} aria-label="Account">
          <option value="">Choose an account</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name} · @{u.username}</option>)}
        </select>
        {!confirm && <button type="button" className="btn" disabled={!user} onClick={() => setConfirm(true)}>Sign out everywhere</button>}
        {confirm && (
          <span className="log-actions">
            <span className="small">Log {picked?.name} out of every device?</span>
            <button type="button" className="btn danger small-btn" onClick={end} disabled={busy}>{busy ? 'Ending…' : 'Yes, end sessions'}</button>
            <button type="button" className="btn small-btn" onClick={() => setConfirm(false)}>Cancel</button>
          </span>
        )}
      </div>
    </section>
  );
}

export default function Security() {
  const [tab, setTab] = useState('log');
  return (
    <div className="page">
      <div className="toolbar">
        <div className="page-title">
          <h2>Security</h2>
          <span className="muted small">Who accessed the team's data, when, from where, and what changed. Admins and the team leader only.</span>
        </div>
        <div className="segmented toolbar-right" role="tablist">
          <button type="button" role="tab" className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>Security log</button>
          <button type="button" role="tab" className={tab === 'deleted' ? 'on' : ''} onClick={() => setTab('deleted')}>Deleted records</button>
          <button type="button" role="tab" className={tab === 'sessions' ? 'on' : ''} onClick={() => setTab('sessions')}>Sessions</button>
        </div>
      </div>
      <Overview />
      <div className="note">
        <Icon name="shield" size={16} />
        <span>
          The log and the deleted records are <strong>append-only</strong>: nothing in the app can change or remove an entry, and the data layer refuses any attempt. Every record that is deleted is copied here first, whichever screen did it, and can be <strong>restored</strong>. Edits are kept field by field, old value and new. Passwords are never written down. Logins from an address an account has never used are marked <strong>new address</strong>.
        </span>
      </div>
      {tab === 'log' && <ActivityLog />}
      {tab === 'deleted' && <DeletedRecords />}
      {tab === 'sessions' && <Sessions />}
    </div>
  );
}
