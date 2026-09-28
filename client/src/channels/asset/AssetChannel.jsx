import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useReconnect, useSocketEvent } from '../../socket/SocketContext.jsx';
import { useToast } from '../../components/Toast.jsx';
import { formatBirthday } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import Dropdown from '../../components/Dropdown.jsx';
import { ConfirmDialog } from '../../components/Modal.jsx';
import AssetForm from './AssetForm.jsx';
import { useLatestRequest } from '../../useLiveData.js';

// Section 3 for the Assets channel: a table of assets for All, one group or
// one member — whatever the tree has selected, within this role's scope.
export default function AssetChannel({ title }) {
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
      const result = await api(`/assets?${params}`);
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
  useSocketEvent('asset:changed', load);

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/assets/${confirm.id}`, { method: 'DELETE' });
      toast('Asset deleted');
      setConfirm(null);
      load();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page muted">Loading...</div>;

  const assets = data.assets;
  const scopeLabel = member
    ? assets[0]?.owner?.name ?? 'Member'
    : data.scope === 'self' ? 'Your assets'
      : group === 'all' ? (data.scope === 'group' ? 'Your group' : 'All assets')
        : data.groups.find((g) => g.slug === group)?.name ?? group;

  return (
    <div className="page asset-page">
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Search name, nationality or contact"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search assets"
          />
        </div>
        <span className="muted small toolbar-count">
          {scopeLabel} · {assets.length} {assets.length === 1 ? 'asset' : 'assets'}
        </span>
        <button className="btn primary" onClick={() => setForm({})}>
          <Icon name="plus" size={16} /> New asset
        </button>
      </div>

      {!assets.length && (
        <div className="empty-inline muted">
          <Icon name="idcard" size={20} />
          {query ? `No assets match "${query}".` : 'No assets here yet. Create one to get started.'}
        </div>
      )}

      {assets.length > 0 && (
        <section className="card">
          <table className="table asset-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="num">Age</th>
                <th>Birthday</th>
                <th>Nationality</th>
                <th>Contact info</th>
                <th>English level</th>
                <th>Belongs to</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td data-label="Name" className="strong">{a.name}</td>
                  <td data-label="Age" className="num">{a.age ?? '—'}</td>
                  <td data-label="Birthday">{a.birthday ? formatBirthday(a.birthday) : '—'}</td>
                  <td data-label="Nationality">{a.nationality || '—'}</td>
                  <td data-label="Contact info">{a.contact || '—'}</td>
                  <td data-label="English level"><span className={`level level-${a.englishLevel.toLowerCase()}`}>{a.englishLevel}</span></td>
                  <td data-label="Belongs to">
                    <div className="cell-user">
                      <Avatar name={a.owner?.name ?? '?'} role={a.owner?.role ?? 'member'} size={24} />
                      <span className="small">{a.owner?.name}</span>
                    </div>
                  </td>
                  <td className="cell-actions">
                    {a.canEdit && (
                      <Dropdown
                        label={`Actions for ${a.name}`}
                        items={[
                          { label: 'Edit asset', icon: 'edit', onClick: () => setForm(a) },
                          { label: 'Delete asset', icon: 'trash', danger: true, onClick: () => setConfirm(a) },
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
        <AssetForm
          asset={form.id ? form : null}
          defaultOwner={member || undefined}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); load(); }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={`Delete ${confirm.name}?`}
          message="The asset and its details are removed for everyone."
          confirmLabel="Delete asset"
          danger
          busy={busy}
          onConfirm={remove}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
