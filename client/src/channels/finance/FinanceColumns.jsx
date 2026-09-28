import { useEffect, useRef, useState } from 'react';
import { formatAmount } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import { compact, niceMax, topRounded } from './chartMath.js';

// Grouped columns: one group per member, one column per series. Shared by
// the Outcome chart (one series) and the Total chart (income and outcome).
//   rows     [{ id, name, values: { <series key>: number }, ...anything detail() needs }]
//   series   [{ key, label, color }]
//   tag      (row, rows) => { text, cls, color } | null   small label above a group
//   tooltip  (row) => node                                extra lines in the hover card
//   detail   (row) => node                                body of the modal a click opens
const MARGIN = { top: 26, right: 8, bottom: 32, left: 56 };
const GAP = 2;
const MAX_COLUMN = 48;

export default function FinanceColumns({ title, periodLabel, rows, series, tag, tooltip, detail, emptyNote }) {
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

  const value = (row, s) => row.values[s.key] || 0;
  const height = Math.round(Math.min(Math.max(width * 0.36, 240), 380));
  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const max = niceMax(Math.max(0, ...rows.flatMap((r) => series.map((s) => value(r, s)))));
  const y = (v) => MARGIN.top + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);

  const n = series.length;
  const slot = rows.length ? plotW / rows.length : 0;
  const column = Math.max(Math.min(MAX_COLUMN, (slot - 24 - GAP * (n - 1)) / n), 4);
  const groupW = column * n + GAP * (n - 1);
  const hasData = rows.some((r) => series.some((s) => value(r, s) > 0));
  const tags = rows.map((r) => (tag && hasData ? tag(r, rows) : null));

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
          <svg width={width} height={height} role="img"
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
                    return v > 0 && <path key={s.key} d={topRounded(x0 + k * (column + GAP), y(v), column, (v / max) * plotH)} fill={s.color} />;
                  })}
                  {t && (
                    <>
                      <rect className="rank-ring" x={x0 - 5} y={peak - 5} width={groupW + 10} height={y(0) - peak + 5} rx="6" />
                      <text className="rank-tag" x={x0 + groupW / 2} y={peak - 10} textAnchor="middle">{t.text}</text>
                    </>
                  )}
                  <text x={MARGIN.left + slot * (i + 0.5)} y={height - 10} textAnchor="middle" className="axis-label category-label">
                    {r.name.split(' ')[0]}
                  </text>
                </g>
              );
            })}
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(0)} y2={y(0)} className="axis-line" />
          </svg>
        )}

        {hover && rows[hover.index] && (
          <div className="chart-tooltip" style={{ left: hover.x, top: MARGIN.top }}>
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
