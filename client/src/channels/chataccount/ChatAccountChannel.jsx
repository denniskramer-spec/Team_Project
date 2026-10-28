import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebounced, useLiveData } from '../../useLiveData.js';
import { useToast } from '../../components/Toast.jsx';
import { formatDay } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import ChatAccountForm from './ChatAccountForm.jsx';

// Section 3 for the Chat accounts channel: one card per Discord, Telegram or
// WhatsApp account, with the residents it talks to.
const EMPTY = [];
const byOwnerThenName = (a, b) => (a.owner?.name ?? '').localeCompare(b.owner?.name ?? '') || a.name.localeCompare(b.name);

export default function ChatAccountChannel({ title }) {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const group = title.key === 'me' ? 'all' : title.key;
  const member = searchParams.get('m') || '';
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState(null);
  const [shot, setShot] = useState(null);
  const q = useDebounced(query);

  const params = new URLSearchParams({ group });
  if (member) params.set('member', member);
  if (q.trim()) params.set('q', q.trim());
  const { data, error, loading, reload } = useLiveData(`/chat-accounts?${params}`, ['chatAccount:changed']);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const all = data?.accounts ?? EMPTY;
  const platforms = data?.platforms ?? EMPTY;
  const active = all.filter((a) => a.status === 'active').length;
  const accounts = all.filter((a) => (!platform || a.platform === platform) && (!status || a.status === status));
  const countOn = (key) => all.filter((a) => a.platform === key).length;
  // One block per platform, each sorted by owner then account name, so a
  // long list reads as categories instead of a wall of cards.
  const sections = platforms
    .map((p) => ({ ...p, accounts: accounts.filter((a) => a.platform === p.key).sort(byOwnerThenName) }))
    .filter((p) => p.accounts.length);
  const scopeLabel = !data ? ''
    : member ? all[0]?.owner?.name ?? 'Member'
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
          {loading || !data ? 'Loading...' : `${scopeLabel} · ${all.length} ${all.length === 1 ? 'account' : 'accounts'} · ${active} active`}
        </span>
        <button className="btn primary" onClick={() => setForm({})} disabled={!data}>
          <Icon name="plus" size={16} /> New account
        </button>
      </div>
      {data && (
        <div className="toolbar account-filters">
          <div className="segmented" role="tablist" aria-label="Platform">
            <button type="button" role="tab" className={platform === '' ? 'on' : ''} onClick={() => setPlatform('')}>All platforms</button>
            {platforms.map((p) => (
              <button type="button" role="tab" key={p.key} className={platform === p.key ? 'on' : ''} onClick={() => setPlatform(p.key)}>
                <span className={`platform platform-${p.key}`}>{p.name}</span> <span className="muted">{countOn(p.key)}</span>
              </button>
            ))}
          </div>
          <div className="segmented" role="tablist" aria-label="Status">
            <button type="button" role="tab" className={status === '' ? 'on' : ''} onClick={() => setStatus('')}>Any status</button>
            <button type="button" role="tab" className={status === 'active' ? 'on' : ''} onClick={() => setStatus('active')}>Active</button>
            <button type="button" role="tab" className={status === 'suspended' ? 'on' : ''} onClick={() => setStatus('suspended')}>Suspended</button>
          </div>
        </div>
      )}

      {/* A failed reload is said here; the last list stays on screen below it. */}
      {error && <div className="alert error">{error}</div>}

      {data && !loading && !accounts.length && (
        <div className="empty-inline muted">
          <Icon name="message" size={20} />
          {query || platform || status ? 'No accounts match this filter.' : 'No chat accounts here yet. Register one to get started.'}
        </div>
      )}

      {sections.map((p) => (
        <section key={p.key} className="account-section">
          <h3 className="account-section-title">
            <span className={`platform platform-${p.key}`}>{p.name}</span>
            <span className="muted small">{p.accounts.length} {p.accounts.length === 1 ? 'account' : 'accounts'} · {p.accounts.filter((a) => a.status === 'active').length} active</span>
          </h3>
          <div className="account-grid">
          {p.accounts.map((a) => (
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
        </section>
      ))}

      {form && (
        <ChatAccountForm
          account={form.id ? form : null}
          platforms={platforms}
          defaultOwner={member || undefined}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); reload(); }}
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
