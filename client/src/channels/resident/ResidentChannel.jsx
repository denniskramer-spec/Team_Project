import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useReconnect, useSocketEvent } from '../../socket/SocketContext.jsx';
import { useToast } from '../../components/Toast.jsx';
import { formatDay } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import Dropdown from '../../components/Dropdown.jsx';
import { ConfirmDialog } from '../../components/Modal.jsx';
import ResidentForm from './ResidentForm.jsx';
import { useLatestRequest } from '../../useLiveData.js';

const Yes = ({ label }) => <span className="yes"><Icon name="tick" size={14} /> {label}</span>;

// Section 3 for the Residents channel: a table of residents for All, one
// group or one member — whatever the tree has selected, within this role's scope.
export default function ResidentChannel({ title }) {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const group = title.key === 'me' ? 'all' : title.key;
  const member = searchParams.get('m') || '';
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const track = useLatestRequest();
  const load = useCallback(async () => {
    const isLatest = track();
    try {
      const params = new URLSearchParams({ group });
      if (member) params.set('member', member);
      if (query.trim()) params.set('q', query.trim());
      const result = await api(`/residents?${params}`);
      if (!isLatest()) return;
      setData(result);
      setError('');
    } catch (err) {
      if (isLatest()) setError(err.message);
    }
  }, [track, group, member, query]);

  useEffect(() => {
    const id = setTimeout(load, query ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, query]);
  useReconnect(load);
  useSocketEvent('resident:changed', load);

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/residents/${confirm.id}`, { method: 'DELETE' });
      toast('Resident deleted');
      setConfirm(null);
      load();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page muted">Loading...</div>;

  const { residents } = data;
  const scopeLabel = member
    ? residents[0]?.owner?.name ?? 'Member'
    : data.scope === 'self' ? 'Your residents'
      : group === 'all' ? (data.scope === 'group' ? 'Your group' : 'All residents')
        : data.groups.find((g) => g.slug === group)?.name ?? group;

  return (
    <div className="page resident-page">
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Search name, country, source"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search residents"
          />
        </div>
        <span className="muted small toolbar-count">
          {scopeLabel} · {residents.length} registered
        </span>
        <button className="btn primary" onClick={() => setForm({})}>
          <Icon name="plus" size={16} /> New resident
        </button>
      </div>

      {!residents.length && (
        <div className="empty-inline muted">
          <Icon name="userPlus" size={20} />
          {query ? `No residents match "${query}".` : 'No residents here yet. Register one to get started.'}
        </div>
      )}

      {residents.length > 0 && (
        <section className="card">
          <table className="table resident-table">
            <thead>
              <tr>
                <th>Resident</th>
                <th className="num">Age</th>
                <th>Country</th>
                <th>Laptop</th>
                <th>Access</th>
                <th className="num">Divide</th>
                <th>First contact</th>
                <th>Belongs to</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {residents.map((r) => (
                <tr key={r.id}>
                  <td data-label="Resident">
                    <div className="cell-user">
                      <Avatar name={r.name} role="member" size={24} src={r.photo?.url} />
                      <div>
                        <div className="strong">{r.name}</div>
                        {r.citizenship && r.citizenship !== r.country && <div className="muted small">Citizen of {r.citizenship}</div>}
                      </div>
                    </div>
                  </td>
                  <td data-label="Age" className="num">{r.age ?? '—'}</td>
                  <td data-label="Country">{r.country || '—'}</td>
                  <td data-label="Laptop">{r.hasLaptop ? <Yes label="Own" /> : <span className="muted">—</span>}</td>
                  <td data-label="Access">{r.accessSetUp ? <Yes label="Laptop" /> : <span className="muted">—</span>}</td>
                  <td data-label="Divide" className="num">{r.sharePercent ? `${r.sharePercent}%` : <span className="muted">—</span>}</td>
                  <td data-label="First contact">
                    {r.firstContact ? formatDay(r.firstContact) : '—'}
                    {r.firstContactVia && <div className="muted small">via {r.firstContactVia}</div>}
                  </td>
                  <td data-label="Belongs to">
                    <div className="cell-user">
                      <Avatar name={r.owner?.name ?? '?'} role={r.owner?.role ?? 'member'} size={20} />
                      <span className="small">{r.owner?.name}</span>
                    </div>
                  </td>
                  <td className="cell-actions">
                    {r.canEdit && (
                      <Dropdown
                        label={`Actions for ${r.name}`}
                        items={[
                          { label: 'Edit resident', icon: 'edit', onClick: () => setForm(r) },
                          { label: 'Delete resident', icon: 'trash', danger: true, onClick: () => setConfirm(r) },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {form && (
        <ResidentForm
          resident={form.id ? form : null}
          defaultOwner={member || undefined}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); load(); }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={`Delete ${confirm.name}?`}
          message="The resident and their details are removed for everyone, and chat accounts no longer list them."
          confirmLabel="Delete resident"
          danger
          busy={busy}
          onConfirm={remove}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
