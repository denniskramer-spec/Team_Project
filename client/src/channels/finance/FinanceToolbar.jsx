import { useEffect, useRef, useState } from 'react';
import { toDateInput, todayInput } from '../../format.js';
import { RANGE, TYPES } from './useFinancePeriod.js';
import { MAX_RANGE_DAYS } from './constants.js';

// The Finance toolbar: the period's name, optional page actions, and
// Week / Month / Year / Duration. Duration opens a picker for a start and
// an end day; the other three show the current week, month or year.
// `currency` (from useCurrency) adds a picker: amounts are recorded in the
// base currency and shown in the chosen one at the day's rate.
// `maxRangeDays` is the longest duration the server accepts.
export default function FinanceToolbar({ period, type, from, to, onType, onRange, scope, actions, currency, maxRangeDays = MAX_RANGE_DAYS }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from: '', to: '' });
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const openPicker = () => {
    // Start from the duration in use, or from the period on screen up to today.
    setDraft({ from: from || (period.start ? toDateInput(period.start) : todayInput()), to: to || todayInput() });
    setOpen((o) => !o);
  };
  // The same checks as the server, so Apply never sends a duration it refuses.
  const days = draft.from && draft.to ? (Date.parse(draft.to) - Date.parse(draft.from)) / 86400000 : 0;
  const problem = !draft.from || !draft.to ? ''
    : days < 0 ? 'The duration ends before it starts'
      : days > maxRangeDays ? `A duration can be at most ${Math.floor(maxRangeDays / 366)} years` : '';
  const valid = Boolean(draft.from && draft.to) && !problem;
  const apply = (e) => {
    e.preventDefault();
    if (!valid) return;
    onRange(draft.from, draft.to);
    setOpen(false);
  };

  return (
    <div className="toolbar period-bar finance-bar">
      <div className="period-label">
        <strong>{period.label}</strong>
        <span className="muted small">{scope}</span>
      </div>
      {actions}
      {currency && (
        <label className="currency-pick" title={currency.code === currency.base
          ? `Amounts are recorded in ${currency.base}`
          : `1 ${currency.base} = ${currency.rate} ${currency.code}${currency.rateDate ? ` · rate of ${currency.rateDate}` : ''}`}
        >
          <span className="muted small">Show in</span>
          <select value={currency.code} onChange={(e) => currency.setCode(e.target.value)} aria-label="Currency">
            {currency.currencies.map((c) => <option key={c} value={c} disabled={c !== currency.base && !Number.isFinite(currency.rates?.[c])}>{c}</option>)}
          </select>
        </label>
      )}
      <div className="finance-range" ref={ref}>
        <div className="segmented" role="radiogroup" aria-label="Period">
          {TYPES.map(([value, label]) => (
            <button
              key={value} type="button" role="radio" aria-checked={type === value}
              className={type === value ? 'on' : ''}
              onClick={() => { setOpen(false); onType(value); }}
            >
              {label}
            </button>
          ))}
          <button
            type="button" role="radio" aria-checked={type === RANGE}
            className={type === RANGE ? 'on' : ''}
            onClick={openPicker}
          >
            Duration
          </button>
        </div>
        {open && (
          <form className="menu duration-menu" onSubmit={apply} aria-label="Choose a duration">
            <label>
              From
              <input type="date" value={draft.from} max={draft.to || undefined} onChange={(e) => setDraft({ ...draft, from: e.target.value })} autoFocus />
            </label>
            <label>
              To
              <input type="date" value={draft.to} min={draft.from || undefined} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
            </label>
            {problem && <p className="small alert-text duration-note">{problem}</p>}
            <div className="duration-actions">
              <button className="btn small-btn" type="button" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn primary small-btn" type="submit" disabled={!valid}>Apply</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
