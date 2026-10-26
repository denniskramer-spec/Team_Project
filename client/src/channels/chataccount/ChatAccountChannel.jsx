import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useReconnect, useSocketEvent } from '../../socket/SocketContext.jsx';
import { useToast } from '../../components/Toast.jsx';
import { formatDay } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import ChatAccountForm from './ChatAccountForm.jsx';
import { useLatestRequest } from '../../useLiveData.js';

// Section 3 for the Chat accounts channel: one card per Discord, Telegram or
// WhatsApp account, with the residents it talks to.
export default function ChatAccountChannel({ title }) {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const group = title.key === 'me' ? 'all' : title.key;
  const member = searchParams.get('m') || '';
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [shot, setShot] = useState(null);

  const track = useLatestRequest();
  const load = useCallback(async () => {
    const isLatest = track();
    try {
      const params = new URLSearchParams({ group });
      if (member) params.set('member', member);
      if (query.trim()) params.set('q', query.trim());
      const result = await api(`/chat-accounts?${params}`);
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
  useSocketEvent('chatAccount:changed', load);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page muted">Loading...</div>;

  const { accounts } = data;
  const active = accounts.filter((a) => a.status === 'active').length;
  const scopeLabel = member
    ? accounts[0]?.owner?.name ?? 'Member'
    : data.scope === 'self' ? 'Your accounts'
      : group === 'all' ? (data.scope === 'group' ? 'Your group' : 'All accounts')
        : data.groups.find((g) => g.slug === group)?.name ?? group;

  return (
    <div className="page account-page">
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Search account name or phone"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search chat accounts"
          />
        </div>
        <span className="muted small toolbar-count">
          {scopeLabel} · {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'} · {active} active
        </span>
        <button className="btn primary" onClick={() => setForm({})}>
          <Icon name="plus" size={16} /> New account
        </button>
      </div>

      {!accounts.length && (
        <div className="empty-inline muted">
          <Icon name="message" size={20} />
          {query ? `No accounts match "${query}".` : 'No chat accounts here yet. Register one to get started.'}
        </div>
      )}

      {accounts.length > 0 && (
        <div className="account-grid">
          {accounts.map((a) => (
            <section key={a.id} className="card account-card">
              <div className="account-head">
                <span className={`platform platform-${a.platform}`}>{a.platformName}</span>
                <span className={`status-badge status-${a.status}`}>{a.status === 'active' ? 'Active' : 'Suspended'}</span>
                {a.canEdit && (
                  <button className="icon-btn" onClick={() => setForm(a)} aria-label={`Edit ${a.name}`}>
                    <Icon name="edit" size={16} />
                  </button>
                )}
              </div>
              <div className="account-name">
                <span title={a.name}>{a.name}</span>
                <button className="icon-btn" onClick={() => copy(a.name)} aria-label={`Copy ${a.name}`}>
                  <Icon name="copy" size={14} />
                </button>
              </div>
              <div className="account-meta muted small">
                {a.phone && <span>{a.phone}</span>}
                {a.joinedAt && <span>Joined {formatDay(a.joinedAt)}</span>}
                {data.scope !== 'self' && !member && a.owner && (
                  <span>{a.owner.name}{a.group ? ` · ${a.group.name}` : ''}</span>
                )}
              </div>
              {a.contacts.length
                ? (
                  <div className="chips">
                    {a.contacts.map((r) => (
                      <span key={r.id} className="chip" title={r.name}>
                        <Avatar name={r.name} role="member" size={18} src={r.photo?.url} />
                        {r.name}
                      </span>
                    ))}
                  </div>
                )
                : <span className="muted small">No residents linked</span>}
              {a.status === 'suspended' && a.screenshot && (
                <button type="button" className="thumb-open account-shot" onClick={() => setShot(a)} aria-label="Open the suspension screenshot">
                  <img src={a.screenshot.url} alt="Suspension screenshot" />
                </button>
              )}
            </section>
          ))}
        </div>
      )}

      {form && (
        <ChatAccountForm
          account={form.id ? form : null}
          platforms={data.platforms}
          defaultOwner={member || undefined}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); load(); }}
        />
      )}
      {shot && (
        <Modal title={`${shot.name} · suspension screenshot`} onClose={() => setShot(null)} width={760}>
          <div className="lightbox">
            <img src={shot.screenshot.url} alt="Suspension screenshot" />
          </div>
        </Modal>
      )}
    </div>
  );
}
