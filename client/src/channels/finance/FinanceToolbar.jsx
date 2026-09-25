import { useEffect, useRef, useState } from 'react';
import { toDateInput } from '../../format.js';
import { RANGE, TYPES } from './useFinancePeriod.js';

// The Finance toolbar: the period's name, optional page actions, and
// Week / Month / Year / Duration. Duration opens a picker for a start and
// an end day; the other three show the current week, month or year.
export default function FinanceToolbar({ period, type, from, to, onType, onRange, scope, actions }) {
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
    setDraft({ from: from || toDateInput(period.start), to: to || toDateInput(new Date()) });
    setOpen((o) => !o);
  };
  const valid = draft.from && draft.to && draft.from <= draft.to;
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
            type="button" role="radio" aria-checked={type === RANGE} aria-expanded={open}
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
