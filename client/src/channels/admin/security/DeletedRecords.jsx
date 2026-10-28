import { useEffect, useState } from 'react';
import { api } from '../../../api.js';
import { useDebounced } from '../../../useLiveData.js';
import { useToast } from '../../../components/Toast.jsx';
import { timeAgo } from '../../../format.js';
import Icon from '../../../components/Icon.jsx';
import { useSort, Th } from '../../../components/SortTable.jsx';
import { when, whoOf } from './labels.js';
import Who from './Who.jsx';
import { usePagedList } from './usePagedList.js';

// What was deleted, and the record itself on request; each one can be put back.

const EMPTY = [];
const DELETED_COLUMNS = {
  when: { by: (r) => r.deletedAt, desc: true },
  who: (r) => whoOf(r.deletedBy),
  type: (r) => r.model,
  record: (r) => r.label || r.recordId,
  address: (r) => r.ip ?? null,
};

function RecordRow({ record, open, snapshot, onToggle, onRestore }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const restore = async (e) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await onRestore();
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };
  return (
    <>
      <tr className={`log-row ${open ? 'is-open' : ''}`} onClick={onToggle}>
        <td data-label="When"><span className="log-when">{when(record.deletedAt)}</span><span className="muted small"> · {timeAgo(record.deletedAt)}</span></td>
        <td data-label="Deleted by"><Who user={record.deletedBy} outside={!record.deletedBy && /^Deleted outside the app/.test(record.reason ?? '')} /></td>
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
              {snapshot?.error
                ? <div className="alert error">Could not load the record: {snapshot.error}</div>
                : <pre>{snapshot?.data ? JSON.stringify(snapshot.data, null, 2) : 'Loading…'}</pre>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function DeletedRecords() {
  const toast = useToast();
  const [model, setModel] = useState('');
  const [state, setState] = useState('gone');
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  const [open, setOpen] = useState(null);
  // The full record of each opened row: { data } once loaded, { error } if not.
  const [snapshot, setSnapshot] = useState({});
  const { rows: records, setRows, extra, hasMore, loading, error, load } = usePagedList((p) => {
    if (model) p.set('model', model);
    if (state) p.set('state', state);
    if (query) p.set('q', query);
    return `/security/deleted?${p}`;
  }, [model, state, query], 'records');
  const models = extra.models ?? EMPTY;
  const sorter = useSort(records, DELETED_COLUMNS);
  useEffect(() => { setOpen(null); }, [model, state, query]);

  const restore = async (id) => {
    try {
      const { record, needsPassword, message } = await api(`/security/deleted/${id}/restore`, { method: 'POST' });
      // Under "Still deleted" the record leaves the list; elsewhere it is marked restored.
      if (state === 'gone') { setRows((rows) => rows.filter((r) => r.id !== id)); setOpen(null); }
      else setRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...record } : r)));
      // A restored account has no password: the admin has to set one before it works.
      if (needsPassword) toast(message, { duration: 10000 });
      else toast(`${record.model} "${record.label || record.recordId}" is back`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const openRow = async (id) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (snapshot[id]?.data) return undefined;
    try {
      const { record } = await api(`/security/deleted/${id}`);
      setSnapshot((s) => ({ ...s, [id]: { data: record.snapshot } }));
    } catch (err) {
      // Shown in the row, so it does not sit on "Loading…"; opening again retries.
      setSnapshot((s) => ({ ...s, [id]: { error: err.message } }));
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
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <div className="search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Record, who deleted it, address…" aria-label="Search deleted records" />
        </div>
        <button type="button" className="btn small-btn toolbar-right" onClick={() => load(false)} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      {error && <div className="alert error">{error}</div>}
      {!records.length && !loading && !error && <div className="empty-inline muted"><Icon name="trash" size={20} /> {state === 'restored' ? 'Nothing has been restored.' : 'Nothing has been deleted.'}</div>}
      {records.length > 0 && (
        <table className="table log-table">
          <thead>
            <tr>
              <Th sort={sorter} col="when">When</Th>
              <Th sort={sorter} col="who">Deleted by</Th>
              <Th sort={sorter} col="type">Type</Th>
              <Th sort={sorter} col="record">Record</Th>
              <Th sort={sorter} col="address">Address</Th>
              <th aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {sorter.rows.map((r) => (
              <RecordRow key={r.id} record={r} open={open === r.id} snapshot={snapshot[r.id]} onToggle={() => openRow(r.id)} onRestore={() => restore(r.id)} />
            ))}
          </tbody>
        </table>
      )}
      {hasMore && <button type="button" className="btn load-more" onClick={() => load(true)} disabled={loading}>Load older</button>}
    </section>
  );
}
