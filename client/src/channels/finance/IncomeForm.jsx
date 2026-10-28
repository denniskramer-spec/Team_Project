import { useEffect, useState } from 'react';
import { api, uploadImages } from '../../api.js';
import { useLatestRequest } from '../../useLiveData.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useToast } from '../../components/Toast.jsx';
import { todayInput, formatAmount, timeAgo } from '../../format.js';
import { load, save } from '../../storage.js';
import { useCurrency } from './useCurrency.js';
import Modal from '../../components/Modal.jsx';
import Icon from '../../components/Icon.jsx';
import ImageDrop from '../../components/ImageDrop.jsx';
import { NOTE_MAX } from './constants.js';

const CURRENCY_KEY = 'bm.incomeCurrency';
// The server rounds each step of the split to cents; the preview does too.
const cents = (n) => Math.round(n * 100) / 100;

// Income record: who earned it, how much (in whatever currency it arrived
// in), when and where it came from, with the task it belongs to if there is
// one. Members record their own; bosses and the team leader can record it
// for the people they manage. The record is kept in the base currency at
// today's rate, with the amount as typed beside it.
export default function IncomeForm({ forSelf, forOthers, onClose, onSaved }) {
  const toast = useToast();
  const { user } = useAuth();
  const rates = useCurrency();
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [residents, setResidents] = useState([]);
  const [methods, setMethods] = useState([]);
  // What the chosen project's reported work still expects to be paid.
  const [upcoming, setUpcoming] = useState(null);
  const [form, setForm] = useState({
    member: '', amount: '', currency: load(CURRENCY_KEY, 'USD'), date: todayInput(), task: '', note: '',
    resident: '', residentPercent: '', method: 'paypal', feePercent: '', feeFixed: '',
  });
  // Screenshots already uploaded (kept across a failed save) and new files.
  const [kept, setKept] = useState([]);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const trackUpcoming = useLatestRequest();

  // A list that fails to load says so: otherwise a required select is
  // simply empty and nothing explains why the form cannot be sent.
  useEffect(() => {
    const failed = (err) => setError(err.message);
    if (forOthers) api('/incomes/members').then((d) => setMembers(d.members)).catch(failed);
    api('/tasks').then((d) => setTasks(d.tasks)).catch(failed);
    api('/residents').then((d) => setResidents(d.residents)).catch(failed);
    api('/incomes/methods').then((d) => {
      setMethods(d.methods);
      const m = d.methods.find((x) => x.key === 'paypal') ?? d.methods[0];
      if (m) setForm((f) => ({ ...f, method: m.key, feePercent: m.feePercent, feeFixed: m.feeFixed }));
    }).catch(failed);
  }, [forOthers]);

  const set = (key) => (e) => { const { value } = e.target; setForm((f) => ({ ...f, [key]: value })); };
  // The currency last used on this device is offered first next time.
  const pickCurrency = (e) => { const { value } = e.target; save(CURRENCY_KEY, value); setForm((f) => ({ ...f, currency: value })); };
  // A remembered currency that is not on offer (rates not loaded, or no
  // rate for it yet) would show as the base while the request sends it.
  const currency = rates.currencies.includes(form.currency) ? form.currency : rates.base;

  // Only the chosen person's projects and residents can be linked ('' = the person recording).
  const ownerId = String(form.member || user.id);
  const ownTasks = tasks.filter((t) => String(t.owner?.id) === ownerId);
  const ownResidents = residents.filter((r) => String(r.owner?.id) === ownerId);
  const pickMember = (e) => {
    const { value } = e.target;
    trackUpcoming(); // a reply for the previous person's project is no longer wanted
    setUpcoming(null);
    setForm((f) => ({ ...f, member: value, task: '', resident: '', residentPercent: '' }));
  };
  // Picking a resident brings their divide %; picking a project brings its resident.
  const pickResident = (id) => {
    const r = ownResidents.find((x) => String(x.id) === String(id));
    setForm((f) => ({ ...f, resident: id, residentPercent: r ? (r.sharePercent || '') : '' }));
  };
  // Picking a project brings its resident, its currency and its payment
  // method (with the usual fee).
  const pickTask = (e) => {
    const t = ownTasks.find((x) => String(x.id) === e.target.value);
    const taskCurrency = t?.currency && rates.currencies.includes(t.currency) ? t.currency : null;
    setForm((f) => ({ ...f, task: e.target.value, ...(taskCurrency ? { currency: taskCurrency } : {}) }));
    setUpcoming(null);
    // Only the reply for the project picked last may show (a slow one for
    // the previous project would otherwise land on top of it).
    const isLatest = trackUpcoming();
    if (t) api(`/incomes/upcoming?task=${t.id}`).then((d) => { if (isLatest()) setUpcoming(d); }).catch(() => {});
    if (t?.resident?.id) pickResident(String(t.resident.id));
    const m = t?.method ? methods.find((x) => x.key === t.method) : null;
    if (m) setForm((f) => ({ ...f, method: m.key, feePercent: m.feePercent, feeFixed: m.feeFixed }));
  };
  const pickMethod = (e) => {
    const m = methods.find((x) => x.key === e.target.value);
    setForm((f) => ({ ...f, method: e.target.value, feePercent: m?.feePercent ?? 0, feeFixed: m?.feeFixed ?? 0 }));
  };

  const method = methods.find((x) => x.key === form.method);
  const feeText = method
    ? `${method.feePercent ? `${method.feePercent}%` : ''}${method.feePercent && method.feeFixed ? ' + ' : ''}${method.feeFixed ? formatAmount(method.feeFixed) : ''}${!method.feePercent && !method.feeFixed ? 'free' : ''}`
    : '—';

  // The amount in the base currency, as the server will record it: fees
  // (in the base) and the split come off that.
  const inBase = currency === rates.base;
  const rate = inBase ? 1 : rates.rates?.[currency];
  const hasRate = inBase || Number.isFinite(rate);
  const typed = Number(form.amount) || 0;
  const gross = hasRate ? cents(typed / rate) : 0;
  const baseMoney = (n) => `${rates.base} ${formatAmount(n)}`;

  // The split, as the server will work it out: fee first, then the resident's share.
  const feeAmount = cents(Math.min(gross, gross * ((Number(form.feePercent) || 0) / 100) + (Number(form.feeFixed) || 0)));
  const afterFee = cents(gross - feeAmount);
  const residentAmount = cents(afterFee * ((Number(form.residentPercent) || 0) / 100));
  const net = cents(afterFee - residentAmount);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let attached = kept;
      if (files.length) {
        const uploaded = await uploadImages('/incomes/upload', files);
        attached = [...kept, ...uploaded.images];
        setKept(attached);
        setFiles([]);
      }
      const images = attached.map(({ file, name, type, size }) => ({ file, name, type, size }));
      const result = await api('/incomes', {
        method: 'POST',
        body: { ...form, currency, member: form.member || undefined, task: form.task || undefined, resident: form.resident || undefined, images },
      });
      toast(result.settled ? `Income recorded · ${result.settled} upcoming ${result.settled === 1 ? 'day' : 'days'} settled` : 'Income recorded');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Record income"
      onClose={onClose}
      width={520}
      footer={(
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" form="income-form" disabled={busy}>
            {busy ? 'Saving...' : 'Record income'}
          </button>
        </>
      )}
    >
      <form id="income-form" className="form-grid" onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        {forOthers && (
          <label>
            Member
            <select value={form.member} onChange={pickMember} required={!forSelf}>
              <option value="">{forSelf ? 'Me' : 'Choose a member'}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}{m.group ? ` · ${m.group}` : ''}</option>
              ))}
            </select>
          </label>
        )}
        <div className="row">
          <label>
            Money
            <span className="money-input">
              <input type="number" min="0" step="0.01" value={form.amount} onChange={set('amount')} required autoFocus aria-label="Amount" />
              <select value={currency} onChange={pickCurrency} aria-label="Currency">
                {rates.currencies.map((c) => (
                  <option key={c} value={c} disabled={c !== rates.base && !Number.isFinite(rates.rates?.[c])}>{c}</option>
                ))}
              </select>
            </span>
          </label>
          <label>
            Date
            <input type="date" value={form.date} onChange={set('date')} required />
          </label>
        </div>
        {!inBase && (
          <p className={`muted small form-note money-rate ${hasRate ? '' : 'alert-text'}`}>
            {hasRate
              ? <>Recorded as <strong>{baseMoney(gross)}</strong> · 1 {rates.base} = {rate} {currency}{rates.rateDate ? ` · rate of ${rates.rateDate}` : ''}{rates.fetchedAt ? ` · checked ${timeAgo(rates.fetchedAt)}` : ''}, refreshed automatically.</>
              : `No exchange rate for ${currency} yet. Record it in ${rates.base} or try again in a moment.`}
          </p>
        )}
        <div className="row">
          <label>
            Project
            <select value={form.task} onChange={pickTask}>
              <option value="">No project</option>
              {ownTasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label>
            Resident
            <select value={form.resident} onChange={(e) => pickResident(e.target.value)}>
              <option value="">None</option>
              {ownResidents.map((r) => <option key={r.id} value={r.id}>{r.name}{r.sharePercent ? ` · ${r.sharePercent}%` : ''}</option>)}
            </select>
          </label>
        </div>
        {form.task && upcoming && upcoming.amount > 0 && (
          <div className="note upcoming-note">
            <Icon name="coins" size={16} />
            <span className="note-grow">
              <strong>Upcoming on this project: {upcoming.currency ?? rates.base} {formatAmount(upcoming.amount)}</strong>
              <span className="muted small"> · {upcoming.days} {upcoming.days === 1 ? 'day' : 'days'} reported, not paid yet. Recording this income settles them.</span>
            </span>
            <button type="button" className="btn small-btn" onClick={() => setForm((f) => ({ ...f, amount: upcoming.amount, currency: upcoming.currency ?? rates.base }))}>Use amount</button>
          </div>
        )}
        {upcoming && upcoming.amount === 0 && form.task && (
          <p className="muted small form-note">Nothing upcoming on this project: all reported work is paid.</p>
        )}
        <div className="row fee-row">
          <label>
            Payment method
            <select value={form.method} onChange={pickMethod}>
              {methods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
          <div className="toggle-field">
            <span className="field-label">Fee</span>
            <div className="fee-shown" title={method?.detail || ''}>
              <strong>{feeText}</strong>
              <span className="muted small">{method?.auto ? `auto · checked ${method.checkedAt ? timeAgo(method.checkedAt) : 'never'}` : 'published rate'}</span>
            </div>
          </div>
        </div>
        <div className="split-preview">
          <div><span className="muted small">Fee{inBase ? '' : ` · ${rates.base}`}</span><strong>−{formatAmount(feeAmount)}</strong></div>
          <div>
            <span className="muted small">Resident share</span>
            <span className="split-share">
              <input type="number" min="0" max="100" step="0.5" value={form.residentPercent} onChange={set('residentPercent')} placeholder="0" aria-label="Resident share %" />
              <span className="muted">%</span>
              <strong>−{formatAmount(residentAmount)}</strong>
            </span>
          </div>
          <div className="split-net"><span className="muted small">Net to you{inBase ? '' : ` · ${rates.base}`}</span><strong>{formatAmount(net)}</strong></div>
        </div>
        <label>
          Note
          <textarea rows={2} maxLength={NOTE_MAX} value={form.note} onChange={set('note')} />
        </label>
        <div className="target-pick">
          <span className="field-label">Screenshots <span className="muted form-help">optional</span></span>
          <ImageDrop
            existing={kept}
            onRemoveExisting={(img) => setKept(kept.filter((k) => k.file !== img.file))}
            files={files}
            onFiles={setFiles}
          />
        </div>
        <p className="muted small form-note">
          Income records are history: once recorded they cannot be changed or deleted, so check the amount, currency and date.
        </p>
      </form>
    </Modal>
  );
}
