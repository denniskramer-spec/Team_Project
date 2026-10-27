import { useEffect, useRef, useState } from 'react';
import { api, upload } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useToast } from '../../components/Toast.jsx';
import { toDateInput, todayInput } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import { COUNTRIES, countryOf } from '../../countries.js';

export const LAPTOP_SOURCES = [['', 'Not set'], ['bought', 'Bought for them'], ['own', 'Already had one']];
export const ACCESS_TYPES = [['', 'Not set'], ['laptop', 'Laptop'], ['vps', 'VPS'], ['proxy', 'Proxy']];

// A country picker with flags. A value typed before the list existed is
// kept as its own option, so nothing saved is lost.
function CountrySelect({ value, onChange, placeholder }) {
  const known = countryOf(value);
  return (
    <select value={value} onChange={onChange}>
      <option value="">{placeholder}</option>
      {value && !known && <option value={value}>{value}</option>}
      {COUNTRIES.map((c) => <option key={c.code} value={c.name}>{c.flag} {c.name}</option>)}
    </select>
  );
}

const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';
const MAX_BYTES = 5 * 1024 * 1024;

// Yes / No for a boolean field, the same height as a text input.
function YesNo({ label, title, value, onChange }) {
  return (
    <div className="toggle-field" title={title}>
      <span className="field-label">{label}</span>
      <div className="segmented yes-no" role="group" aria-label={label}>
        <button type="button" className={value ? 'on' : ''} onClick={() => onChange(true)}>Yes</button>
        <button type="button" className={!value ? 'on no' : ''} onClick={() => onChange(false)}>No</button>
      </div>
    </div>
  );
}

// Register or edit a resident: photo, name, where they are from, how the
// contact started, laptop and remote access, notes.
export default function ResidentForm({ resident, defaultOwner, onClose, onSaved }) {
  const toast = useToast();
  const { user } = useAuth();
  // Residents belong to members and bosses; the leader and admins pick one.
  const canOwn = ['member', 'boss'].includes(user.role);
  const editing = Boolean(resident);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({
    name: resident?.name ?? '',
    country: resident?.country ?? '',
    citizenship: resident?.citizenship ?? '',
    age: resident?.age ?? '',
    source: resident?.source ?? '',
    firstContact: toDateInput(resident?.firstContact),
    firstContactVia: resident?.firstContactVia ?? '',
    hasLaptop: resident?.hasLaptop ?? false,
    laptopSource: resident?.laptopSource ?? '',
    accessSetUp: resident?.accessSetUp ?? false,
    accessType: resident?.accessType ?? '',
    sharePercent: resident?.sharePercent || '',
    owner: resident?.owner?.id ?? defaultOwner ?? '',
    notes: resident?.notes ?? '',
  });
  // The saved photo (null once removed) and a newly chosen file, if any.
  const [photo, setPhoto] = useState(resident?.photo ?? null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const fileInput = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/residents/owners').then((d) => setMembers(d.members)).catch(() => setMembers([]));
  }, []);

  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const setFlag = (key) => (value) => setForm({ ...form, [key]: value });

  const choose = (e) => {
    const [f] = e.target.files ?? [];
    e.target.value = '';
    if (!f) return;
    if (!ACCEPT.split(',').includes(f.type)) { setError('The photo must be a PNG, JPEG, GIF or WebP image'); return; }
    if (f.size > MAX_BYTES) { setError('The photo can be at most 5 MB'); return; }
    setError('');
    setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let saved = photo;
      if (file) {
        const fd = new FormData();
        fd.append('images', file);
        const uploaded = await upload('/residents/upload', fd);
        // Treat it as saved from now on, so a retry after a failed save does
        // not upload the same photo again.
        saved = { ...uploaded.photo, url: `/api/files/${uploaded.photo.file}` };
        setPhoto(saved);
        setFile(null);
      }
      const body = {
        ...form,
        owner: form.owner || undefined,
        age: form.age === '' ? null : Number(form.age),
        sharePercent: form.sharePercent === '' ? 0 : Number(form.sharePercent),
        laptopSource: form.hasLaptop ? form.laptopSource : '',
        accessType: form.accessSetUp ? form.accessType : '',
        firstContact: form.firstContact || null,
        photo: saved ? { file: saved.file, name: saved.name, type: saved.type, size: saved.size } : null,
      };
      if (editing) await api(`/residents/${resident.id}`, { method: 'PATCH', body });
      else await api('/residents', { method: 'POST', body });
      toast(editing ? 'Resident updated' : 'Resident registered');
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const shown = preview || photo?.url;

  return (
    <Modal
      title={editing ? `Edit ${resident.name}` : 'Register a resident'}
      onClose={onClose}
      width={560}
      footer={(
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" form="resident-form" disabled={busy}>
            {busy ? 'Saving...' : editing ? 'Save changes' : 'Register resident'}
          </button>
        </>
      )}
    >
      <form id="resident-form" className="form-grid" onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        <div className="photo-row">
          <div className="photo-pick">
            <button type="button" className="photo-box" onClick={() => fileInput.current?.click()} aria-label={shown ? 'Change photo' : 'Add photo'}>
              {shown ? <img src={shown} alt="" /> : '?'}
            </button>
            {shown
              ? <button type="button" className="link" onClick={() => { setFile(null); setPhoto(null); }}>Remove</button>
              : <button type="button" className="link" onClick={() => fileInput.current?.click()}>Add photo</button>}
            <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={choose} />
          </div>
          <label>
            Name
            <input value={form.name} onChange={set('name')} maxLength={80} placeholder="Full name" required autoFocus />
          </label>
        </div>
        <div className="row-3">
          <label>
            Country
            <CountrySelect value={form.country} onChange={set('country')} placeholder="Where they live" />
          </label>
          <label>
            Citizenship
            <CountrySelect value={form.citizenship} onChange={set('citizenship')} placeholder="Passport country" />
          </label>
          <label>
            Age
            <input type="number" min="0" max="130" step="1" value={form.age} onChange={set('age')} />
          </label>
        </div>
        <label>
          Source
          <input value={form.source} onChange={set('source')} maxLength={160} placeholder="Where / how you got this contact: referral, Telegram group, outreach..." />
        </label>
        <div className="row">
          <label>
            First contact
            <input type="date" max={todayInput()} value={form.firstContact} onChange={set('firstContact')} />
          </label>
          <label>
            First contacted via
            <input value={form.firstContactVia} onChange={set('firstContactVia')} maxLength={60} placeholder="Telegram, Instagram, in person..." />
          </label>
        </div>
        <div className="row">
          <YesNo label="Has a laptop?" value={form.hasLaptop} onChange={setFlag('hasLaptop')} />
          <label>
            Laptop source
            <select value={form.laptopSource} onChange={set('laptopSource')} disabled={!form.hasLaptop}>
              {LAPTOP_SOURCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <YesNo label="Access set up?" title="Remote access to their device" value={form.accessSetUp} onChange={setFlag('accessSetUp')} />
          <label title="What the remote access goes through">
            Access type
            <select value={form.accessType} onChange={set('accessType')} disabled={!form.accessSetUp}>
              {ACCESS_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <label title="Their share of the income you earn with them">
            Divide %
            <div className="percent-input">
              <input type="number" min="0" max="100" step="0.5" value={form.sharePercent} onChange={set('sharePercent')} placeholder="0" />
              <span>%</span>
            </div>
          </label>
        </div>
        {(!canOwn || members.length > 1) && (
          <label>
            Belongs to
            <select value={form.owner} onChange={set('owner')} required={!canOwn}>
              <option value="">{canOwn ? 'Me' : 'Choose a member'}</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.group ? ` · ${m.group}` : ''}</option>)}
            </select>
          </label>
        )}
        <label>
          Notes
          <textarea rows={3} maxLength={2000} value={form.notes} onChange={set('notes')} placeholder="Optional — anything else worth knowing" />
        </label>
      </form>
    </Modal>
  );
}
