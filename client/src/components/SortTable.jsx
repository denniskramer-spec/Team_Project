import { useMemo, useState } from 'react';

// Sortable tables. A table declares how each column is read from a row:
//
//   const COLUMNS = { name: (r) => r.name, amount: { by: (r) => r.amount, desc: true } };
//   const sorter = useSort(rows, COLUMNS);
//   <Th sort={sorter} col="name">Name</Th>   ...   sorter.rows.map(...)
//
// Until a header is clicked the rows keep the order they came in. Clicking a
// header sorts by that column (columns marked `desc` start with the biggest
// first, which is what you want for dates and amounts); clicking again flips
// it. Empty values always go to the bottom.

const isEmpty = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));

export function compareValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function useSort(rows, columns, initial = null) {
  const [key, setKey] = useState(initial);
  const [dir, setDir] = useState(() => (initial && columns[initial]?.desc ? 'desc' : 'asc'));

  const sorted = useMemo(() => {
    const col = columns[key];
    if (!col || !Array.isArray(rows)) return rows;
    const by = typeof col === 'function' ? col : col.by;
    const sign = dir === 'desc' ? -1 : 1;
    return rows
      .map((row, index) => ({ row, index, value: by(row) }))
      .sort((a, b) => {
        const ea = isEmpty(a.value);
        const eb = isEmpty(b.value);
        if (ea || eb) return ea === eb ? a.index - b.index : ea ? 1 : -1;
        return (compareValues(a.value, b.value) * sign) || a.index - b.index;
      })
      .map((x) => x.row);
  }, [rows, columns, key, dir]);

  const toggle = (next) => {
    if (next === key) setDir(dir === 'asc' ? 'desc' : 'asc');
    else {
      setKey(next);
      setDir(columns[next]?.desc ? 'desc' : 'asc');
    }
  };

  return { rows: sorted, key, dir, toggle };
}

function Arrow({ dir }) {
  return (
    <svg className={`sort-arrow ${dir ? `is-${dir}` : ''}`} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path className="sort-up" d="M6 2.5l3 3.5H3z" />
      <path className="sort-down" d="M6 9.5L3 6h6z" />
    </svg>
  );
}

// A header cell. With `col` it is a button that sorts the table by that
// column; without, a plain <th> (used for action columns).
export function Th({ sort, col, children, className = '', ...rest }) {
  if (!col || !sort) return <th className={className} {...rest}>{children}</th>;
  const active = sort.key === col;
  return (
    <th
      className={`sortable ${active ? 'is-sorted' : ''} ${className}`.trim()}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      {...rest}
    >
      <button type="button" className="sort-btn" onClick={() => sort.toggle(col)}>
        <span>{children}</span>
        <Arrow dir={active ? sort.dir : null} />
      </button>
    </th>
  );
}
