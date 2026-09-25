import { formatAmount } from '../../format.js';

// One measure, a few series, horizontal bars.
// Each bar carries its own label and value, so identity never depends on colour.
// Measures with different scales (money vs counts) get their own chart.
export default function BarCompare({ title, unit, series, note }) {
  const max = Math.max(...series.map((s) => s.value), 0);
  const target = series.find((s) => s.target)?.value ?? 0;
  const achieved = series.find((s) => s.achieved);

  return (
    <figure className="chart">
      <figcaption>
        <h3>{title}</h3>
        {achieved && target > 0 && (
          <span className={`chart-share ${achieved.value >= target ? 'good' : ''}`}>
            {Math.round((achieved.value / target) * 100)}% of plan
          </span>
        )}
      </figcaption>
      <ul className="bars">
        {series.map((s) => (
          <li key={s.label} title={`${s.label}: ${formatAmount(s.value)}${unit ? ` ${unit}` : ''}`}>
            <span className="bar-label">{s.label}</span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{ width: `${max ? Math.max((s.value / max) * 100, s.value > 0 ? 2 : 0) : 0}%`, background: `var(--series-${s.slot})` }}
              />
            </span>
            <span className="bar-value">{formatAmount(s.value)}</span>
          </li>
        ))}
      </ul>
      {note && <p className="muted small chart-note">{note}</p>}
    </figure>
  );
}
