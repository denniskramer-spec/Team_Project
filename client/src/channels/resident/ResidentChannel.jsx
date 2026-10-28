import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useDebounced, useLiveData } from '../../useLiveData.js';
import { useToast } from '../../components/Toast.jsx';
import { formatDay } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import Dropdown from '../../components/Dropdown.jsx';
import { ConfirmDialog } from '../../components/Modal.jsx';
import ResidentForm, { ACCESS_TYPES, labelOf, Yes } from './ResidentForm.jsx';
import { countryLabel } from '../../countries.js';
import { useSort, Th } from '../../components/SortTable.jsx';

const EMPTY = [];

// Section 3 for the Residents channel: a table of residents for All, one
// group or one member — whatever the tree has selected, within this role's scope.
const COLUMNS = {
  resident: (r) => r.name,
  age: (r) => r.age ?? null,
  country: (r) => (r.country ? countryLabel(r.country) : null),
  laptop: (r) => (r.hasLaptop ? r.laptopSource || 'yes' : null),
  access: (r) => (r.accessSetUp ? labelOf(ACCESS_TYPES, r.accessType) || 'set up' : null),
  divide: { by: (r) => r.sharePercent || null, desc: true },
  firstContact: { by: (r) => r.firstContact ?? null, desc: true },
  owner: (r) => r.owner?.name ?? null,
};

export default function ResidentChannel({ title }) {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const group = title.key === 'me' ? 'all' : title.key;
  const member = searchParams.get('m') || '';
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const q = useDebounced(query);

  const params = new URLSearchParams({ group });
  if (member) params.set('member', member);
  if (q.trim()) params.set('q', q.trim());
  const { data, error, loading, reload } = useLiveData(`/residents?${params}`, ['resident:changed']);
  const residents = data?.residents ?? EMPTY;
  const sorter = useSort(residents, COLUMNS);

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/residents/${confirm.id}`, { method: 'DELETE' });
      toast('Resident deleted');
      setConfirm(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const scopeLabel = !data ? ''
    : member ? residents[0]?.owner?.name ?? 'Member'
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
          {loading || !data ? 'Loading...' : `${scopeLabel} · ${residents.length} registered`}
        </span>
        <button className="btn primary" onClick={() => setForm({})}>
          <Icon name="plus" size={16} /> New resident
        </button>
      </div>

      {/* A failed reload is said here; the last list stays on screen below it. */}
      {error && <div className="alert error">{error}</div>}

      {data && !loading && !residents.length && (
        <div className="empty-inline muted">
          <Icon name="userPlus" size={20} />
          {q ? `No residents match "${q}".` : 'No residents here yet. Register one to get started.'}
        </div>
      )}

      {residents.length > 0 && (
        <section className="card">
          <table className="table resident-table">
            <thead>
              <tr>
                <Th sort={sorter} col="resident">Resident</Th>
                <Th sort={sorter} col="age" className="num">Age</Th>
                <Th sort={sorter} col="country">Country</Th>
                <Th sort={sorter} col="laptop">Laptop</Th>
                <Th sort={sorter} col="access">Access</Th>
                <Th sort={sorter} col="divide" className="num">Divide</Th>
                <Th sort={sorter} col="firstContact">First contact</Th>
                <Th sort={sorter} col="owner">Belongs to</Th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {sorter.rows.map((r) => (
                <tr key={r.id}>
                  <td data-label="Resident">
                    <div className="cell-user">
                      <Avatar name={r.name} role="member" size={24} src={r.photo?.url} />
                      <div>
                        <div className="strong">{r.name}</div>
                        {r.citizenship && r.citizenship !== r.country && <div className="muted small">Citizen of {countryLabel(r.citizenship)}</div>}
                      </div>
                    </div>
                  </td>
                  <td data-label="Age" className="num">{r.age ?? '—'}</td>
                  <td data-label="Country">{r.country ? countryLabel(r.country) : '—'}</td>
                  <td data-label="Laptop">{r.hasLaptop ? <Yes label={r.laptopSource === 'bought' ? 'Bought' : r.laptopSource === 'own' ? 'Own' : 'Yes'} /> : <span className="muted">—</span>}</td>
                  <td data-label="Access">{r.accessSetUp ? <Yes label={labelOf(ACCESS_TYPES, r.accessType) || 'Set up'} /> : <span className="muted">—</span>}</td>
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
          onSaved={() => { setForm(null); reload(); }}
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
