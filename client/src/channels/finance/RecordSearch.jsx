import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { formatAmount, formatDate } from '../../format.js';

// A search box over a finance record list. Every word typed must appear
// somewhere in the record's text (member, project, reason, note, method,
// date, amount...), in any order and case. It filters the records already
// listed (the newest LIST_LIMIT of the period), so it is instant.
//   textOf(record) -> array of strings/numbers/dates describing the record
export function useRecordSearch(records, textOf) {
  const [query, setQuery] = useState('');
  const key = query.trim().toLowerCase();
  const index = useMemo(
    () => new Map(records.map((r) => [r, textOf(r).flatMap(searchText).join(' ').toLowerCase()])),
    [records, textOf],
  );
  const rows = useMemo(() => {
    const words = key.split(/\s+/).filter(Boolean);
    return words.length ? records.filter((r) => words.every((w) => index.get(r).includes(w))) : records;
  }, [records, index, key]);
  return { query, setQuery, rows, active: key !== '' };
}

// The sum of one field over records, to the cent.
export const sumOf = (records, by) => Math.round(records.reduce((t, r) => t + (Number(by(r)) || 0), 0) * 100) / 100;

// A value in every form someone might type it: 1847.86 as "1847.86" and
// "1,847.86"; a date as shown (11/02/2026) and as 2026-11-02.
function searchText(value) {
  if (value == null || value === '') return [];
  if (typeof value === 'number') return [String(value), formatAmount(value)];
  if (value instanceof Date || /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? [] : [formatDate(d, { utc: true }), d.toISOString().slice(0, 10)];
  }
  return [String(value)];
}

export default function RecordSearch({ search, noun, shown, total }) {
  return (
    <div className="record-search">
      <div className="search">
        <Icon name="search" size={16} />
        <input
          type="search"
          placeholder={`Search ${noun}`}
          aria-label={`Search ${noun}`}
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') search.setQuery(''); }}
        />
      </div>
      {search.active && <span className="muted small" aria-live="polite">{shown} of {total}</span>}
    </div>
  );
}
