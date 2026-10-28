import { nameOf } from '../../format.js';
import FinanceToolbar from './FinanceToolbar.jsx';
import { scopeLabel } from './useFinancePeriod.js';

// Before the first load, or when it failed, the toolbar still needs a period.
const NO_PERIOD = { label: '—', start: null };

// The frame the three Finance pages share. The toolbar is always there, so
// a period the server refused (too long a duration, a group out of reach)
// can be changed from the page itself; the error sits where the numbers
// go. While another period loads, the previous numbers stay, dimmed.
//   page      what useFinancePage returned
//   noun      "income" / "outcome" / "total", for "Your income"
//   actions   toolbar buttons, shown once there is data
//   body      (data) => the page body, once there is data
//   children  dialogs the page opens (forms, lightbox)
export default function FinancePage({ page, noun, actions, body, children }) {
  const { period, currency, data, error, loading } = page;
  const reloading = Boolean(loading && data && !error);
  return (
    <div className={`page finance-page${reloading ? ' is-loading' : ''}`} aria-busy={reloading || undefined}>
      <FinanceToolbar
        period={(!error && data?.period) || NO_PERIOD}
        type={period.type} from={period.from} to={period.to}
        onType={period.setType} onRange={period.setRange}
        scope={data && !error ? scopeLabel(data, period, data.chart?.[0]?.member?.name, noun) : ''}
        maxRangeDays={currency.limits?.maxRangeDays}
        actions={data && !error ? actions : null}
      />
      {error && <div className="alert error">{error}</div>}
      {!data && !error && <p className="muted">Loading...</p>}
      {data && !error && body(data)}
      {children}
    </div>
  );
}

// One tile per group this role can see, so the groups sit side by side;
// the group chosen in the title list is outlined.
//   value(g)    the big number
//   caption(g)  the line under it
export function GroupTiles({ tiles, selected, value, caption }) {
  return (tiles ?? []).map((g) => (
    <div key={g.id} className={`stat role-border-boss${selected === g.slug ? ' is-selected' : ''}`}>
      <span className="stat-value">{value(g)}</span>
      <span className="muted small">{caption(g)}</span>
    </div>
  ));
}

// An amount per member as bars against the biggest (the server sends them
// biggest first). Only worth showing with more than one person.
export function MemberBars({ title, rows, money, out = false }) {
  if (!(rows?.length > 1)) return null;
  const top = rows[0]?.amount ?? 0;
  return (
    <section className="card">
      <div className="report-section-head"><h3>{title}</h3></div>
      <ul className="bar-list">
        {rows.map((row) => (
          <li key={row.member?.id ?? 'unknown'}>
            <span className="bar-label">{nameOf(row.member)}</span>
            <span className="bar-track">
              <span className={`bar-fill${out ? ' out' : ''}`} style={{ width: `${top ? (row.amount / top) * 100 : 0}%` }} />
            </span>
            <span className="bar-value">{money(row.amount)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
