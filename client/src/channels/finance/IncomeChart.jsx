import { useState } from 'react';
import { formatAmount, formatDay, nameOf, shownOf } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import { useSort, Th } from '../../components/SortTable.jsx';
import DateTag from '../../components/DateTag.jsx';
import { GAP, MARGIN, columnLayout, compact, fitLabel, rankOf, tooltipLeft, topRounded, useElementWidth } from './chartMath.js';
import { TOOLTIP_LIMIT } from './constants.js';

// Planned vs real income per member, as grouped columns:
//   blue          = planned income (from the member's plan)
//   green + red   = income (records) with the upcoming income due in this
//                   period (by its upcoming date) stacked on top
// Values are money, so the two columns share one axis.
const SERIES = [
  { key: 'planned', label: 'Planned', color: 'var(--series-1)' },
  { key: 'actual', label: 'Net income', color: 'var(--series-3)' },
  { key: 'upcoming', label: 'Upcoming', color: 'var(--series-2)' },
];

// Everything behind one member's column, in full.
const EMPTY = [];
const ITEM_COLUMNS = {
  date: { by: (i) => i.date ?? null, desc: true },
  project: (i) => (i.task ? i.task.name : i.from || null),
  amount: { by: (i) => i.amount, desc: true },
};

function MemberDetail({ row, periodLabel, onClose }) {
  const items = row.incomeItems ?? EMPTY;
  const upcoming = row.upcomingItems ?? EMPTY;
  const itemSort = useSort(items, ITEM_COLUMNS);
  const upcomingSort = useSort(upcoming, ITEM_COLUMNS);
  return (
    <Modal title={`${nameOf(row.member)} · ${periodLabel}`} onClose={onClose} width={640}>
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
          <h4>Income · {row.incomeCount ?? items.length} {(row.incomeCount ?? items.length) === 1 ? 'record' : 'records'}</h4>
          {shownOf(items.length, row.incomeCount) && <p className="muted small list-note">{shownOf(items.length, row.incomeCount)}</p>}
          {items.length ? (
            <table className="table">
              <thead>
                <tr>
                  <Th sort={itemSort} col="date">Date</Th>
                  <Th sort={itemSort} col="project">Project</Th>
                  <Th sort={itemSort} col="amount" className="num">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {itemSort.rows.map((i) => (
                  <tr key={i.id}>
                    <td><DateTag value={i.date} utc /></td>
                    <td>{i.task ? i.task.name : i.from || '—'}{i.note && <div className="muted small">{i.note}</div>}</td>
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
              <thead>
                <tr>
                  <Th sort={upcomingSort} col="date">Expected</Th>
                  <Th sort={upcomingSort} col="project">Task / note</Th>
                  <Th sort={upcomingSort} col="amount" className="num">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {upcomingSort.rows.map((u, n) => (
                  <tr key={n}>
                    <td>{u.date ? <DateTag value={u.date} utc /> : <span className="muted">No date</span>}<div className="muted small">reported {formatDay(u.reportDay)}</div></td>
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
  const [wrap, width] = useElementWidth();
  const [hover, setHover] = useState(null);
  const [open, setOpen] = useState(null);

  const { height, plotH, slot, column, groupW: pairW, y, barH, ticks } = columnLayout({
    width, rows: rows.length, perGroup: 2,
    maxValue: Math.max(0, ...rows.map((r) => Math.max(r.planned, r.actual + r.upcoming))),
  });
  const hasData = rows.some((r) => r.planned || r.actual || r.upcoming);
  // Who is highest and lowest this period, by recorded income only (the green segment).
  const rank = rankOf(rows.map((r) => r.actual));

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
          <svg width={width} height={height} role="group"
            aria-label={rows.map((r) => `${nameOf(r.member)}: planned ${formatAmount(r.planned)}, income ${formatAmount(r.actual)}, upcoming ${formatAmount(r.upcoming)}`).join('; ')}
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
              const xReal = x0 + column + GAP;
              const upcomingH = barH(r.upcoming);
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
                  {r.planned > 0 && <path d={topRounded(x0, y(r.planned), column, barH(r.planned))} fill="var(--series-1)" />}
                  {r.actual > 0 && <path d={topRounded(xReal, y(r.actual), column, barH(r.actual))} fill="var(--series-3)" />}
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
                    {fitLabel(r.member.name.split(' ')[0], slot)}
                  </text>
                </g>
              );
            })}
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(0)} y2={y(0)} className="axis-line" />
          </svg>
        )}

        {hover && rows[hover.index] && (
          <div className="chart-tooltip" style={{ left: tooltipLeft(hover.x, width), top: MARGIN.top }}>
            <strong>{nameOf(rows[hover.index].member)}</strong>
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
