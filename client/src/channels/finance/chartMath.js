import { useEffect, useRef, useState } from 'react';

// Shared by the Finance column charts (IncomeChart, FinanceColumns).

export const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

// Round the axis top up to a friendly number: 1, 2, 2.5, 5 × 10^n.
export function niceMax(value) {
  if (!(value > 0)) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * exp >= value);
  return step * exp;
}

// A column with 4px rounded corners on its top edge only.
export function topRounded(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  if (h <= 0) return '';
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

// A category label cut to what fits in a column `width` pixels wide.
export function fitLabel(text, width) {
  const max = Math.max(2, Math.floor(width / 7.5));
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

// The width of the element the returned ref is put on, kept up to date as
// it resizes (the charts draw themselves to fit it).
export function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export const MARGIN = { top: 26, right: 8, bottom: 32, left: 56 }; // top leaves room for the Top/Lowest tags
export const GAP = 2; // surface gap between adjacent columns and stacked segments
const MAX_COLUMN = 48;

// Where things go in a column chart `width` pixels wide: `rows` slots of
// `perGroup` columns each, and a y scale topped at a friendly number above
// `maxValue`. Taller on wide screens so the chart fills the page instead of
// sitting in a strip.
export function columnLayout({ width, rows, perGroup, maxValue }) {
  const height = Math.round(Math.min(Math.max(width * 0.36, 240), 380));
  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const max = niceMax(maxValue);
  const slot = rows ? plotW / rows : 0;
  const column = Math.max(Math.min(MAX_COLUMN, (slot - 24 - GAP * (perGroup - 1)) / perGroup), 4);
  return {
    height, plotW, plotH, max, slot, column,
    groupW: column * perGroup + GAP * (perGroup - 1),
    y: (v) => MARGIN.top + plotH - (v / max) * plotH,
    barH: (v) => (v / max) * plotH,
    ticks: [0, 0.25, 0.5, 0.75, 1].map((t) => t * max),
  };
}

// The hover card is centred on its column but kept inside the plot, so the
// last columns don't push it off the right edge (where it would be squeezed).
const TOOLTIP_HALF = 150; // half of .chart-tooltip's max-width
export const tooltipLeft = (x, width) => Math.min(Math.max(x, TOOLTIP_HALF), Math.max(width - TOOLTIP_HALF, TOOLTIP_HALF));

// Top and lowest among the rows that have something recorded (`active`; by
// default a value above 0). Everyone tied at the top or bottom is tagged;
// nothing is tagged with fewer than two such rows or when they are all
// equal; a row with nothing recorded is never tagged — "Lowest" would
// otherwise mark half the chart. Returns (i) => 'top' | 'low' | ''.
export function rankOf(values, active = values.map((v) => v > 0)) {
  const live = values.filter((_, i) => active[i]);
  const best = Math.max(...live);
  const worst = Math.min(...live);
  if (live.length < 2 || best === worst) return () => '';
  return (i) => (!active[i] ? '' : values[i] === best ? 'top' : values[i] === worst ? 'low' : '');
}
