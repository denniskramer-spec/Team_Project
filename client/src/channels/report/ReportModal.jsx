import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useToast } from '../../components/Toast.jsx';
import Icon from '../../components/Icon.jsx';

const RESULTS = [{ key: 'well', label: 'Went well' }, { key: 'mixed', label: 'Mixed' }, { key: 'bad', label: "Didn't go well" }];
const EMPTY_CALL = { time: '', title: '', profile: '', caller: '', result: '', note: '' };

// The saved report (or nothing) as form state.
function toForm(r, context) {
  const work = Object.fromEntries((r?.work ?? []).map((w) => [String(w.task.id), { text: w.text, hours: w.hours || '', count: w.count || '' }]));
  // A new day's plan starts from what the previous report planned for it.
  const todayPlan = r?.todayPlan?.length
    ? r.todayPlan.map((p) => ({ ...p }))
    : (context?.previousPlan?.items ?? []).map((text) => ({ text, done: false }));
  return {
    work,
    todayPlan,
    calls: (r?.calls ?? []).map((c) => ({ ...c })),
    jobBid: r?.jobBid || '', aiBid: r?.aiBid || '', resumes: r?.resumes || '', forms: r?.forms || '', biddingHours: r?.biddingHours || '', bidNote: r?.bidNote ?? '',
    issues: r?.issues ?? '', planTomorrow: r?.planTomorrow ?? '',
  };
}

// What a day's work earns after the resident's share: price × hours on an
// hourly project, price × tasks done on a per-task one.
const unitsOf = (p, w) => (p.priceUnit === 'hour' ? Number(w?.hours) : p.priceUnit === 'task' ? Number(w?.count) : 0) || 0;
const earns = (p, w) => (p.price > 0 && unitsOf(p, w) > 0 ? p.price * unitsOf(p, w) * (1 - (p.residentPercent || 0) / 100) : 0);
const money = (n) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);

const clock = (value) => new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

function Section({ title, meta, children }) {
  return (
    <section className="rm-section">
      <div className="rm-section-head">
        <span className="rm-section-title">{title}</span>
        {meta && <span className="muted small">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

// The daily report, written in a modal: today's plan, one box per active
// project, calls, bids, candidate contacts, residents, issues, tomorrow's
// plan. It saves as a draft while typing; "Send report" sends it.
export default function ReportModal({ period, report, context, onClose, onSaved, onPeriod }) {
  const toast = useToast();
  const { user } = useAuth();
  const [form, setForm] = useState(() => toForm(report, context));
  const [savedAt, setSavedAt] = useState(report?.updatedAt ?? null);
  const [sentAt, setSentAt] = useState(report?.sentAt ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newItem, setNewItem] = useState('');
  const dirty = useRef(false);
  const timer = useRef(null);

  // Another period: start from that period's report.
  useEffect(() => {
    setForm(toForm(report, context));
    setSavedAt(report?.updatedAt ?? null);
    setSentAt(report?.sentAt ?? null);
    dirty.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.key, report?.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The latest form, for the delayed draft save.
  const latest = useRef(form);
  latest.current = form;

  const body = (f, send = false) => ({
    ...f,
    type: 'daily',
    period: period.key,
    scope: 'personal',
    send,
    work: Object.entries(f.work).map(([task, w]) => ({ task, text: w.text, hours: w.hours || 0, count: w.count || 0 })),
  });

  const save = async (send = false) => {
    setBusy(true);
    setError('');
    try {
      const { report: saved } = await api('/reports', { method: 'PUT', body: body(latest.current, send) });
      setSavedAt(saved.updatedAt);
      setSentAt(saved.sentAt);
      dirty.current = false;
      onSaved();
      if (send) {
        toast('Report sent');
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Drafts save on their own, a moment after the last change.
  const update = (patch) => {
    setForm((f) => ({ ...f, ...(typeof patch === 'function' ? patch(f) : patch) }));
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (dirty.current) save(false); }, 1500);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const set = (key) => (e) => update({ [key]: e.target.value });
  const setWork = (id, key) => (e) => update((f) => ({ work: { ...f.work, [id]: { ...(f.work[id] ?? { text: '', hours: '' }), [key]: e.target.value } } }));
  const setCall = (i, key, value) => update((f) => ({ calls: f.calls.map((c, n) => (n === i ? { ...c, [key]: value } : c)) }));
  const togglePlan = (i) => update((f) => ({ todayPlan: f.todayPlan.map((p, n) => (n === i ? { ...p, done: !p.done } : p)) }));
  const addItem = () => {
    if (!newItem.trim()) return;
    update((f) => ({ todayPlan: [...f.todayPlan, { text: newItem.trim(), done: false }] }));
    setNewItem('');
  };
  const carry = () => {
    const left = form.todayPlan.filter((p) => !p.done).map((p) => p.text);
    if (!left.length) return;
    update((f) => {
      const lines = f.planTomorrow.split('\n').filter(Boolean);
      return { planTomorrow: [...lines, ...left.filter((t) => !lines.includes(t))].join('\n') };
    });
  };

  const projects = context?.projects ?? [];
  const written = projects.filter((p) => form.work[String(p.id)]?.text?.trim()).length;
  const upcoming = projects.reduce((sum, p) => sum + earns(p, form.work[String(p.id)]), 0);
  const planDone = form.todayPlan.filter((p) => p.done).length;
  const callsDone = form.calls.filter((c) => c.result).length;

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal report-modal" role="dialog" aria-modal="true" aria-label="Daily report">
        <div className="rm-head">
          <span className="rm-head-icon"><Icon name="file" size={16} /></span>
          <div className="rm-head-text">
            <span className="rm-kicker">Daily report · {period.isCurrent ? 'today' : 'past day'}</span>
            <strong>{period.label}</strong>
          </div>
          {onPeriod && (
            <div className="rm-period">
              <button className="icon-btn" onClick={() => onPeriod(period.prev)} aria-label="Previous day"><Icon name="chevronLeft" size={16} /></button>
              <button className="link rm-today" onClick={() => onPeriod('')} disabled={period.isCurrent}>Today</button>
              <button className="icon-btn" onClick={() => onPeriod(period.next)} aria-label="Next day" disabled={!period.hasNext}><Icon name="chevronRight" size={16} /></button>
            </div>
          )}
          <button className="icon-btn modal-close" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>

        <div className="modal-body rm-body">
          <div className="rm-sheet">
            <div>
              <h2 className="rm-title">Daily report — {user.name}</h2>
              <div className="muted small">{period.label}{period.isCurrent ? ' · today' : ''}</div>
            </div>
            {error && <div className="alert error">{error}</div>}

            <Section title="Today's plan" meta={`${context?.previousPlan ? `from ${context.previousPlan.period} · ` : ''}${planDone}/${form.todayPlan.length} done`}>
              {form.todayPlan.length === 0 && <p className="muted small rm-empty">Nothing planned for today yet. The previous report's "plan for tomorrow" lands here.</p>}
              <ul className="rm-checklist">
                {form.todayPlan.map((p, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <li key={i}>
                    <label className="check">
                      <input type="checkbox" checked={p.done} onChange={() => togglePlan(i)} />
                      <span className={p.done ? 'is-done' : ''}>{p.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="rm-add">
                <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add an item" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} />
                <button type="button" className="btn small-btn" onClick={addItem}>Add</button>
              </div>
              {form.todayPlan.some((p) => !p.done) && (
                <button type="button" className="link rm-carry" onClick={carry}><Icon name="chevronRight" size={12} /> Carry the unticked ones to tomorrow</button>
              )}
            </Section>

            <Section title="Project report" meta={`${written} of ${projects.length} written${upcoming > 0 ? ` · upcoming ${money(upcoming)}` : ''}`}>
              {projects.length === 0 && <p className="muted small rm-empty">No active projects. Register one in Projects and it gets a box here.</p>}
              {projects.map((p) => {
                const w = form.work[String(p.id)] ?? { text: '', hours: '', count: '' };
                const perTask = p.priceUnit === 'task';
                return (
                  <div key={p.id} className="rm-project">
                    <div className="rm-project-head">
                      <span className={`rm-dot${w.text.trim() ? ' on' : ''}`} />
                      <div className="rm-project-name">
                        <strong>{p.name}</strong>
                        <span className="muted small">{[p.resident ? `for ${p.resident}` : null, p.source, p.priceLabel].filter(Boolean).join(' · ')}</span>
                      </div>
                      <label className="rm-hours">
                        <Icon name="target" size={12} />
                        {perTask
                          ? <input type="number" min="0" step="1" value={w.count} onChange={setWork(String(p.id), 'count')} placeholder="0" aria-label={`Tasks done on ${p.name}`} />
                          : <input type="number" min="0" max="24" step="0.5" value={w.hours} onChange={setWork(String(p.id), 'hours')} placeholder="0" aria-label={`Hours on ${p.name}`} />}
                        <span>{perTask ? 'tasks' : 'h'}</span>
                        {earns(p, w) > 0 && <span className="rm-earns">≈ {money(earns(p, w))}{p.residentPercent ? ` after ${p.residentPercent}%` : ''}</span>}
                      </label>
                    </div>
                    <textarea rows={3} maxLength={2000} value={w.text} onChange={setWork(String(p.id), 'text')} placeholder="What you did on this project today — one line per item" />
                  </div>
                );
              })}
            </Section>

            <Section title="Call report" meta={`${form.calls.length} ${form.calls.length === 1 ? 'call' : 'calls'} · ${callsDone} done`}>
              {form.calls.map((c, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={i} className="rm-call">
                  <div className="rm-call-head">
                    <input className="rm-time" value={c.time} onChange={(e) => setCall(i, 'time', e.target.value)} placeholder="19:00" aria-label="Call time" maxLength={5} />
                    <input value={c.title} onChange={(e) => setCall(i, 'title', e.target.value)} placeholder="1st intro call · Company (Role)" aria-label="Call" maxLength={160} />
                    {c.result && <span className={`status-badge call-${c.result}`}>Done</span>}
                    <button type="button" className="icon-btn" onClick={() => update((f) => ({ calls: f.calls.filter((_, n) => n !== i) }))} aria-label="Remove call"><Icon name="close" size={14} /></button>
                  </div>
                  <div className="row">
                    <input value={c.profile} onChange={(e) => setCall(i, 'profile', e.target.value)} placeholder="Profile" aria-label="Profile" maxLength={120} />
                    <input value={c.caller} onChange={(e) => setCall(i, 'caller', e.target.value)} placeholder="Caller" aria-label="Caller" maxLength={120} />
                  </div>
                  <div className="segmented rm-result" role="radiogroup" aria-label="How the call went">
                    {RESULTS.map((r) => (
                      <button key={r.key} type="button" role="radio" aria-checked={c.result === r.key} className={c.result === r.key ? `on ${r.key}` : ''} onClick={() => setCall(i, 'result', c.result === r.key ? '' : r.key)}>{r.label}</button>
                    ))}
                  </div>
                  <textarea rows={2} maxLength={2000} value={c.note} onChange={(e) => setCall(i, 'note', e.target.value)} placeholder="How it went — optional" />
                </div>
              ))}
              <button type="button" className="btn small-btn rm-add-call" onClick={() => update((f) => ({ calls: [...f.calls, { ...EMPTY_CALL }] }))}><Icon name="plus" size={14} /> Add call</button>
            </Section>

            <Section title="Bid report">
              <div className="rm-grid">
                <label>Applied<input type="number" min="0" step="1" value={form.jobBid} onChange={set('jobBid')} placeholder="0" /></label>
                <label>AI training bids<input type="number" min="0" step="1" value={form.aiBid} onChange={set('aiBid')} placeholder="0" /></label>
                <label>Résumés tailored<input type="number" min="0" step="1" value={form.resumes} onChange={set('resumes')} placeholder="0" /></label>
                <label>Forms filled<input type="number" min="0" step="1" value={form.forms} onChange={set('forms')} placeholder="0" /></label>
                <label>Time bidding (h)<input type="number" min="0" max="24" step="0.5" value={form.biddingHours} onChange={set('biddingHours')} placeholder="0" /></label>
              </div>
              <textarea rows={2} maxLength={2000} value={form.bidNote} onChange={set('bidNote')} placeholder="Add a note on bids — optional" />
            </Section>

            <Section title="Issues / blockers" meta="optional">
              <textarea rows={2} maxLength={2000} value={form.issues} onChange={set('issues')} placeholder="Anything blocking you? One per line." />
            </Section>

            <Section title="Plan for tomorrow" meta="optional">
              <textarea rows={3} maxLength={2000} value={form.planTomorrow} onChange={set('planTomorrow')} placeholder="What's the plan for tomorrow? One per line." />
            </Section>

          </div>
        </div>

        <div className="rm-foot">
          <div className="rm-status">
            <strong>{sentAt ? `Sent ${clock(sentAt)}` : 'Not sent yet'}</strong>
            <span className="muted small">{busy ? 'Saving...' : savedAt ? `Draft saved ${clock(savedAt)}` : 'Nothing saved yet'}</span>
          </div>
          <button className="btn primary" onClick={() => save(true)} disabled={busy}>
            <Icon name="send" size={14} /> {sentAt ? 'Send again' : 'Send report'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
