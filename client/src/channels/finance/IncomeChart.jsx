import { useEffect, useRef, useState } from 'react';
import { formatAmount, formatDay } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import { compact, niceMax, topRounded } from './chartMath.js';

// Planned vs real income per member, as grouped columns:
//   blue          = planned income (from the member's plan)
//   green + red   = income (records) with upcoming income stacked on top
// Values are money, so the two columns share one axis.
const SERIES = [
  { key: 'planned', label: 'Planned', color: 'var(--series-1)' },
  { key: 'actual', label: 'Income', color: 'var(--series-3)' },
  { key: 'upcoming', label: 'Upcoming', color: 'var(--series-2)' },
];

const MARGIN = { top: 26, right: 8, bottom: 32, left: 56 };  // top leaves room for the Top/Lowest tags
const GAP = 2;           // surface gap between stacked segments and adjacent columns
const MAX_COLUMN = 48;
// More items than this and the hover card only summarises; a click opens the full list.
const TOOLTIP_LIMIT = 8;

// Everything behind one member's column, in full.
function MemberDetail({ row, periodLabel, onClose }) {
  const items = row.incomeItems ?? [];
  const upcoming = row.upcomingItems ?? [];
  return (
    <Modal title={`${row.member.name} · ${periodLabel}`} onClose={onClose} width={640}>
      <div className="income-detail">
        <div className="stat-row">
          {SERIES.map((s) => (
            <div key={s.key} className="stat" style={{ borderLeftColor: s.color }}>
              <span className="stat-value">{formatAmount(row[s.key])}</span>
              <span className="muted small">{s.label}</span>
            </div>
          ))}
        </div>

        <section>
          <h4>Income · {items.length} {items.length === 1 ? 'record' : 'records'}</h4>
          {items.length ? (
            <table className="table">
              <thead><tr><th>Date</th><th>Task / from</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>{formatDay(i.date)}</td>
                    <td>{i.task ? i.task.name : i.from}{i.task && i.from ? <span className="muted small"> · {i.from}</span> : null}{i.note && <div className="muted small">{i.note}</div>}</td>
                    <td className="num strong">{formatAmount(i.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted small">No income recorded.</p>}
        </section>

        <section>
          <h4>Upcoming · {upcoming.length} {upcoming.length === 1 ? 'item' : 'items'}</h4>
          {upcoming.length ? (
            <table className="table">
              <thead><tr><th>Expected</th><th>Task / note</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {upcoming.map((u, n) => (
                  <tr key={n}>
                    <td>{u.date ? formatDay(u.date) : <span className="muted">No date</span>}<div className="muted small">reported {formatDay(u.reportDay)}</div></td>
                    <td>{u.task ? u.task.name : <span className="muted">—</span>}{u.note && <div className="muted small">{u.note}</div>}</td>
                    <td className="num strong">{formatAmount(u.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted small">Nothing upcoming reported.</p>}
        </section>
      </div>
    </Modal>
  );
}

export default function IncomeChart({ rows, periodLabel }) {
  const wrap = useRef(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Taller on wide screens so the chart fills the page instead of sitting in a strip.
  const height = Math.round(Math.min(Math.max(width * 0.36, 240), 380));
  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const max = niceMax(Math.max(0, ...rows.map((r) => Math.max(r.planned, r.actual + r.upcoming))));
  const y = (v) => MARGIN.top + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);

  const slot = rows.length ? plotW / rows.length : 0;
  const column = Math.max(Math.min(MAX_COLUMN, (slot - 24) / 2 - GAP / 2), 4);
  const pairW = column * 2 + GAP;
  const hasData = rows.some((r) => r.planned || r.actual || r.upcoming);

  // Who is highest and lowest this period, by recorded income only (the
  // green segment). Everyone tied at the top or bottom is tagged; nothing
  // is tagged when there is one person or everyone is equal.
  const earned = rows.map((r) => r.actual);
  const best = Math.max(...earned);
  const worst = Math.min(...earned);
  const ranked = rows.length > 1 && best !== worst;
  const rank = (i) => (!ranked ? '' : earned[i] === best ? 'top' : earned[i] === worst ? 'low' : '');

  return (
    <figure className="chart income-chart">
      <figcaption>
        <h3>Planned vs real income</h3>
        <span className="muted small">{periodLabel}</span>
      </figcaption>

      <ul className="chart-legend" aria-label="Series">
        {SERIES.map((s) => (
          <li key={s.key}><span className="legend-swatch" style={{ background: s.color }} />{s.label}</li>
        ))}
      </ul>

      <div className="income-chart-plot" ref={wrap} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img"
            aria-label={rows.map((r) => `${r.member.name}: planned ${formatAmount(r.planned)}, income ${formatAmount(r.actual)}, upcoming ${formatAmount(r.upcoming)}`).join('; ')}
          >
            {/* Gridlines and axis labels stay recessive. */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} className="grid-line" />
                <text x={MARGIN.left - 8} y={y(t)} dy="0.35em" textAnchor="end" className="axis-label">{compact.format(t)}</text>
              </g>
            ))}

            {rows.map((r, i) => {
              const x0 = MARGIN.left + slot * i + (slot - pairW) / 2;
              const xPlanned = x0;
              const xReal = x0 + column + GAP;
              const actualH = (r.actual / max) * plotH;
              const upcomingH = (r.upcoming / max) * plotH;
              // The red segment sits on top of the green one with a 2px surface gap.
              const upcomingBottom = y(r.actual) - (r.actual > 0 && r.upcoming > 0 ? GAP : 0);
              const active = hover?.index === i;
              const tag = rank(i);
              const peak = Math.min(y(r.planned), y(r.actual + r.upcoming));
              return (
                <g key={r.member.id} className={`column-group${tag ? ` ${tag}` : ''}${hover && !active ? ' dim' : ''}`}
                  onMouseEnter={() => setHover({ index: i, x: x0 + pairW / 2 })}
                  onClick={() => setOpen(i)}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(i); } }}
                >
                  {/* Hit target covers the whole slot, wider than the marks. */}
                  <rect x={MARGIN.left + slot * i} y={MARGIN.top} width={slot} height={plotH} fill="transparent" />
                  {r.planned > 0 && <path d={topRounded(xPlanned, y(r.planned), column, (r.planned / max) * plotH)} fill="var(--series-1)" />}
                  {r.actual > 0 && <path d={topRounded(xReal, y(r.actual), column, actualH)} fill="var(--series-3)" />}
                  {r.upcoming > 0 && (
                    <path d={topRounded(xReal, upcomingBottom - upcomingH, column, upcomingH)} fill="var(--series-2)" />
                  )}
                  {tag && (
                    <>
                      {/* Outline around the pair, plus a tag above it. */}
                      <rect className="rank-ring" x={x0 - 5} y={peak - 5} width={pairW + 10} height={y(0) - peak + 5} rx="6" />
                      <text className="rank-tag" x={x0 + pairW / 2} y={peak - 10} textAnchor="middle">
                        {tag === 'top' ? '★ Top' : '▼ Lowest'}
                      </text>
                    </>
                  )}
                  <text x={MARGIN.left + slot * (i + 0.5)} y={height - 10} textAnchor="middle" className="axis-label category-label">
                    {r.member.name.split(' ')[0]}
                  </text>
                </g>
              );
            })}
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(0)} y2={y(0)} className="axis-line" />
          </svg>
        )}

        {hover && rows[hover.index] && (
          <div className="chart-tooltip" style={{ left: hover.x, top: MARGIN.top }}>
            <strong>{rows[hover.index].member.name}</strong>
            {SERIES.map((s) => (
              <span key={s.key} className="tooltip-row">
                <span className="legend-swatch" style={{ background: s.color }} />
                <span className="muted">{s.label}</span>
                <span className="tooltip-value">{formatAmount(rows[hover.index][s.key])}</span>
              </span>
            ))}
            {(() => {
              const row = rows[hover.index];
              const items = row.incomeItems ?? [];
              const upcoming = row.upcomingItems ?? [];
              const count = items.length + upcoming.length;
              if (!count) return null;
              // Too much for a hover card: summarise, and the click opens the full list.
              if (count > TOOLTIP_LIMIT) {
                return <span className="tooltip-hint">{items.length} income · {upcoming.length} upcoming · click for details</span>;
              }
              return (
                <>
                  {items.length > 0 && (
                    <ul className="tooltip-detail">
                      <li className="muted small">Income</li>
                      {items.map((i) => (
                        <li key={i.id}>
                          <span className="tooltip-name">{formatDay(i.date)} · {i.task ? i.task.name : i.from}</span>
                          <span className="tooltip-value">{formatAmount(i.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {upcoming.length > 0 && (
                    <ul className="tooltip-detail">
                      <li className="muted small">Upcoming</li>
                      {upcoming.map((u, n) => (
                        <li key={n}>
                          <span className="tooltip-name">{u.date ? formatDay(u.date) : 'No date'}{u.task ? ` · ${u.task.name}` : ''}</span>
                          <span className="tooltip-value">{formatAmount(u.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <span className="tooltip-hint">click for details</span>
                </>
              );
            })()}
            <span className="tooltip-row tooltip-total">
              <span className="muted">Income + upcoming</span>
              <span className="tooltip-value">{formatAmount(rows[hover.index].actual + rows[hover.index].upcoming)}</span>
            </span>
          </div>
        )}
      </div>

      {!hasData && <p className="muted small chart-note">Nothing planned, recorded or upcoming for {periodLabel}.</p>}
      {open !== null && rows[open] && <MemberDetail row={rows[open]} periodLabel={periodLabel} onClose={() => setOpen(null)} />}
    </figure>
  );
}
