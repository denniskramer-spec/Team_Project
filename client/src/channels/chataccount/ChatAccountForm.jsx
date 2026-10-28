import { useState } from 'react';
import { api, uploadImages } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { useOptions } from '../../options.js';
import { toDateInput, todayInput } from '../../format.js';
import Modal, { ConfirmDialog } from '../../components/Modal.jsx';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import ImageDrop from '../../components/ImageDrop.jsx';
import OwnerSelect from '../../components/OwnerSelect.jsx';

// What the name field means on each platform.
const NAME_HINT = {
  discord: { placeholder: 'Account#1234', help: 'Username or label' },
  telegram: { placeholder: '@handle', help: 'Telegram handle' },
  whatsapp: { placeholder: '+1 809 292 4098', help: 'Phone number' },
};

// Register or edit a chat account: platform, name, joined date, the
// residents it talks to, and whether it is active or suspended (with a
// screenshot of the suspension screen).
export default function ChatAccountForm({ account, platforms, defaultOwner, onClose, onSaved }) {
  const toast = useToast();
  const editing = Boolean(account);
  const { list: residents, error: residentsError, loading: residentsLoading } = useOptions('/chat-accounts/contacts', 'residents');
  const [form, setForm] = useState({
    platform: account?.platform ?? 'discord',
    name: account?.name ?? '',
    phone: account?.phone ?? '',
    joinedAt: toDateInput(account?.joinedAt),
    status: account?.status ?? 'active',
    owner: account?.owner?.id ?? defaultOwner ?? '',
  });
  const [contacts, setContacts] = useState(account?.contacts.map((r) => String(r.id)) ?? []);
  // The saved screenshot (null once removed) and a newly chosen file, if any.
  const [shot, setShot] = useState(account?.screenshot ?? null);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const toggle = (id) => setContacts((list) => (list.includes(id) ? list.filter((c) => c !== id) : [...list, id]));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let saved = shot;
      if (files.length) {
        // Uploaded first and kept as saved from then on, so a retry after a
        // failed save does not upload the same screenshot again.
        ({ screenshot: saved } = await uploadImages('/chat-accounts/upload', [files[0]]));
        setShot(saved);
        setFiles([]);
      }
      const body = {
        ...form,
        owner: form.owner || undefined,
        joinedAt: form.joinedAt || null,
        contacts,
        screenshot: saved,
      };
      if (editing) await api(`/chat-accounts/${account.id}`, { method: 'PATCH', body });
      else await api('/chat-accounts', { method: 'POST', body });
      toast(editing ? 'Account updated' : 'Account registered');
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/chat-accounts/${account.id}`, { method: 'DELETE' });
      toast('Account deleted');
      onSaved();
    } catch (err) {
      setConfirm(false);
      setError(err.message);
      setBusy(false);
    }
  };

  const hint = NAME_HINT[form.platform] ?? NAME_HINT.discord;
  const platformName = platforms.find((p) => p.key === form.platform)?.name ?? 'the';

  return (
    <Modal
      title={editing ? `Edit ${account.name}` : 'Register a chat account'}
      onClose={onClose}
      width={520}
      footer={(
        <>
          {editing && account.canEdit && (
            <button className="btn danger" type="button" onClick={() => setConfirm(true)} disabled={busy}>Delete</button>
          )}
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" form="chat-account-form" disabled={busy}>
            {busy ? 'Saving...' : editing ? 'Save changes' : 'Register account'}
          </button>
        </>
      )}
    >
      <form id="chat-account-form" className="form-grid" onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        <div className="row">
          <label>
            Account type
            <select value={form.platform} onChange={set('platform')}>
              {platforms.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </label>
          <label>
            Account name
            <input value={form.name} onChange={set('name')} maxLength={80} placeholder={hint.placeholder} required autoFocus />
            <span className="form-help">{hint.help}</span>
          </label>
        </div>
        {form.platform === 'telegram' && (
          <label>
            Phone number
            <input value={form.phone} onChange={set('phone')} maxLength={40} placeholder="+1 430 732 1270" />
            <span className="form-help">The number behind the handle (optional)</span>
          </label>
        )}
        <label>
          Joined date
          <input type="date" max={todayInput()} value={form.joinedAt} onChange={set('joinedAt')} />
          <span className="form-help">When this {platformName} account was created / joined</span>
        </label>
        <div className="target-pick">
          <span className="field-label">Contacts</span>
          {residentsLoading && <span className="muted small">Loading residents...</span>}
          {residentsError && <span className="form-help alert-text">Could not load the residents: {residentsError}</span>}
          {!residentsLoading && !residentsError && residents.length === 0 && <span className="muted small">No residents yet — register one in the Residents channel first.</span>}
          {residents.length > 0 && (
            <div className="chips" role="group" aria-label="Contacts">
              {residents.map((r) => {
                const on = contacts.includes(String(r.id));
                return (
                  <button key={r.id} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(String(r.id))}>
                    <Avatar name={r.name} role="member" size={18} src={r.photo?.url} />
                    {r.name}
                    {on && <Icon name="tick" size={14} className="tick" />}
                  </button>
                );
              })}
            </div>
          )}
          <span className="form-help">The residents this account talks to — pick any number</span>
        </div>
        <div className="toggle-field">
          <span className="field-label">Status</span>
          <div className="segmented" role="group" aria-label="Status">
            <button type="button" className={form.status === 'active' ? 'on' : ''} onClick={() => setForm({ ...form, status: 'active' })}>Active</button>
            <button type="button" className={form.status === 'suspended' ? 'on urgent' : ''} onClick={() => setForm({ ...form, status: 'suspended' })}>Suspended</button>
          </div>
        </div>
        {form.status === 'suspended' && (
          <div className="target-pick">
            <span className="field-label">Suspension screenshot</span>
            <ImageDrop
              existing={shot ? [shot] : []}
              onRemoveExisting={() => setShot(null)}
              files={files}
              onFiles={(list) => { setFiles(list.slice(-1)); if (list.length) setShot(null); }}
              max={1}
            />
            <span className="form-help">Attach a screenshot of the suspension screen</span>
          </div>
        )}
        <OwnerSelect path="/chat-accounts/owners" value={form.owner} onChange={set('owner')} />
      </form>
      {confirm && (
        <ConfirmDialog
          title={`Delete ${account.name}?`}
          message="The account and its links to residents are removed for everyone."
          confirmLabel="Delete account"
          danger
          busy={busy}
          onConfirm={remove}
          onClose={() => setConfirm(false)}
        />
      )}
    </Modal>
  );
}
