import { useState } from 'react';
import { formatAmount } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import { GAP, MARGIN, columnLayout, compact, fitLabel, tooltipLeft, topRounded, useElementWidth } from './chartMath.js';

// Grouped columns: one group per member, one column per series. Shared by
// the Outcome chart (one series) and the Total chart (income and outcome).
//   rows     [{ id, name, values: { <series key>: number }, ...anything detail() needs }]
//   series   [{ key, label, color }]
//   tag      (row, rows, i) => { text, cls, color } | null   small label above a group
//   tooltip  (row) => node                                   extra lines in the hover card
//   detail   (row) => node                                   body of the modal a click opens
export default function FinanceColumns({ title, periodLabel, rows, series, tag, tooltip, detail, emptyNote }) {
  const [wrap, width] = useElementWidth();
  const [hover, setHover] = useState(null);
  const [open, setOpen] = useState(null);

  const value = (row, s) => row.values[s.key] || 0;
  const n = series.length;
  const { height, plotH, slot, column, groupW, y, barH, ticks } = columnLayout({
    width, rows: rows.length, perGroup: n,
    maxValue: Math.max(0, ...rows.flatMap((r) => series.map((s) => value(r, s)))),
  });
  const hasData = rows.some((r) => series.some((s) => value(r, s) > 0));
  const tags = rows.map((r, i) => (tag && hasData ? tag(r, rows, i) : null));

  return (
    <figure className="chart income-chart columns-chart">
      <figcaption>
        <h3>{title}</h3>
        <span className="muted small">{periodLabel}</span>
      </figcaption>

      {n > 1 && (
        <ul className="chart-legend" aria-label="Series">
          {series.map((s) => (
            <li key={s.key}><span className="legend-swatch" style={{ background: s.color }} />{s.label}</li>
          ))}
        </ul>
      )}

      <div className="income-chart-plot" ref={wrap} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="group"
            aria-label={rows.map((r) => `${r.name}: ${series.map((s) => `${s.label} ${formatAmount(value(r, s))}`).join(', ')}`).join('; ')}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} className="grid-line" />
                <text x={MARGIN.left - 8} y={y(t)} dy="0.35em" textAnchor="end" className="axis-label">{compact.format(t)}</text>
              </g>
            ))}

            {rows.map((r, i) => {
              const x0 = MARGIN.left + slot * i + (slot - groupW) / 2;
              const active = hover?.index === i;
              const t = tags[i];
              const peak = Math.min(...series.map((s) => y(value(r, s))));
              const openDetail = () => detail && setOpen(i);
              return (
                <g key={r.id} className={`column-group${t ? ` ${t.cls}` : ''}${hover && !active ? ' dim' : ''}`}
                  style={t?.color ? { '--rank': t.color } : undefined}
                  onMouseEnter={() => setHover({ index: i, x: x0 + groupW / 2 })}
                  onClick={openDetail}
                  role={detail ? 'button' : undefined} tabIndex={detail ? 0 : undefined}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(); } }}
                >
                  {/* Hit target covers the whole slot, wider than the marks. */}
                  <rect x={MARGIN.left + slot * i} y={MARGIN.top} width={slot} height={plotH} fill="transparent" />
                  {series.map((s, k) => {
                    const v = value(r, s);
                    return v > 0 && <path key={s.key} d={topRounded(x0 + k * (column + GAP), y(v), column, barH(v))} fill={s.color} />;
                  })}
                  {t && (
                    <>
                      <rect className="rank-ring" x={x0 - 5} y={peak - 5} width={groupW + 10} height={y(0) - peak + 5} rx="6" />
                      <text className="rank-tag" x={x0 + groupW / 2} y={peak - 10} textAnchor="middle">{t.text}</text>
                    </>
                  )}
                  <text x={MARGIN.left + slot * (i + 0.5)} y={height - 10} textAnchor="middle" className="axis-label category-label">
                    {fitLabel(r.name.split(' ')[0], slot)}
                  </text>
                </g>
              );
            })}
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(0)} y2={y(0)} className="axis-line" />
          </svg>
        )}

        {hover && rows[hover.index] && (
          <div className="chart-tooltip" style={{ left: tooltipLeft(hover.x, width), top: MARGIN.top }}>
            <strong>{rows[hover.index].name}</strong>
            {series.map((s) => (
              <span key={s.key} className="tooltip-row">
                <span className="legend-swatch" style={{ background: s.color }} />
                <span className="muted">{s.label}</span>
                <span className="tooltip-value">{formatAmount(value(rows[hover.index], s))}</span>
              </span>
            ))}
            {tooltip?.(rows[hover.index])}
          </div>
        )}
      </div>

      {!hasData && <p className="muted small chart-note">{emptyNote}</p>}
      {open !== null && rows[open] && detail && (
        <Modal title={`${rows[open].name} · ${periodLabel}`} onClose={() => setOpen(null)} width={640}>
          {detail(rows[open])}
        </Modal>
      )}
    </figure>
  );
}
