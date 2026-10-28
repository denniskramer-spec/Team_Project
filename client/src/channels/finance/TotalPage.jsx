import { useState } from 'react';
import { formatAmount, toDateInput, nameOf, shownOf } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import FinanceColumns from './FinanceColumns.jsx';
import FinancePage, { GroupTiles } from './FinancePage.jsx';
import { useFinancePage } from './useFinancePage.js';
import { rankOf } from './chartMath.js';
import DateTag from '../../components/DateTag.jsx';
import { useSort, Th } from '../../components/SortTable.jsx';

const SERIES = [
  { key: 'income', label: 'Income', color: 'var(--series-3)' },
  { key: 'outcome', label: 'Outcome', color: 'var(--series-2)' },
];

// "+1,234" or "−567", with the class that colours it.
const signed = (n) => ({ text: `${n < 0 ? '−' : '+'}${formatAmount(Math.abs(n))}`, cls: n < 0 ? 'net-bad' : 'net-good' });

// Net above each member's pair of columns. The best and worst net among
// the people with something recorded get the Top / Lowest highlight, like
// the Income chart (see rankOf); someone with nothing recorded gets no tag.
const netOf = (row) => row.values.income - row.values.outcome;
const hasActivity = (row) => Boolean(row.values.income || row.values.outcome);
function netTags(rows) {
  const rank = rankOf(rows.map(netOf), rows.map(hasActivity));
  return (row, all, i) => {
    if (!hasActivity(row)) return null;
    const net = netOf(row);
    if (rank(i) === 'top') return { text: `★ Top ${signed(net).text}`, cls: 'top', color: 'var(--series-3)' };
    if (rank(i) === 'low') return { text: `▼ Lowest ${signed(net).text}`, cls: 'low', color: 'var(--status-warning)' };
    return { text: signed(net).text, cls: 'net', color: net < 0 ? 'var(--series-2)' : 'var(--series-3)' };
  };
}

// Income and outcome rows in one table. `by` decides the first column:
// the date when grouped by person, the member when grouped by date.
const HISTORY_COLUMNS = {
  date: { by: (r) => r.date, desc: true },
  member: (r) => nameOf(r.member, ''),
  type: (r) => r.kind,
  detail: (r) => r.label,
  amount: { by: (r) => r.amount, desc: true },
};

function HistoryTable({ rows, by }) {
  const sorter = useSort(rows, HISTORY_COLUMNS);
  return (
    <table className="table finance-table history-table">
      <thead>
        <tr>
          <Th sort={sorter} col={by === 'person' ? 'date' : 'member'}>{by === 'person' ? 'Date' : 'For'}</Th>
          <Th sort={sorter} col="type">Type</Th>
          <Th sort={sorter} col="detail">Detail</Th>
          <Th sort={sorter} col="amount" className="num">Amount</Th>
        </tr>
      </thead>
      <tbody>
        {sorter.rows.map((r) => (
          <tr key={`${r.kind}-${r.id}`}>
            <td data-label={by === 'person' ? 'Date' : 'Member'}>
              {by === 'person' ? <DateTag value={r.date} utc /> : (
                <div className="cell-user">
                  <Avatar name={r.member?.name ?? '?'} role={r.member?.role ?? 'member'} size={22} />
                  <span>{nameOf(r.member, '')}</span>
                </div>
              )}
            </td>
            <td data-label="Type"><span className={`tag flow-tag ${r.kind === 'income' ? 'in' : 'out'}`}>{r.kind}</span></td>
            <td data-label="Detail">
              {r.label}
              {r.task && <span className="tag task-tag">{r.task.name}</span>}
              {r.note && <div className="muted small">{r.note}</div>}
            </td>
            <td data-label="Amount" className={`num strong amount ${r.kind === 'income' ? 'in' : 'out'}`}>
              {r.kind === 'income' ? '+' : '−'}{formatAmount(r.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// In, out and net for a set of rows.
function Sums({ rows }) {
  const inn = rows.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amount, 0);
  const out = rows.filter((r) => r.kind === 'outcome').reduce((s, r) => s + r.amount, 0);
  const net = signed(inn - out);
  return (
    <span className="history-sums">
      <span className="amount in">+{formatAmount(inn)}</span>
      <span className="amount out">−{formatAmount(out)}</span>
      <strong className={net.cls}>= {net.text}</strong>
    </span>
  );
}

// Groups the history by member (A–Z) or by day (newest first).
function groupHistory(history, by) {
  const groups = new Map();
  history.forEach((r) => {
    const key = by === 'person' ? String(r.member?.id ?? 'unknown') : toDateInput(r.date);
    if (!groups.has(key)) groups.set(key, { key, member: r.member, date: r.date, rows: [] });
    groups.get(key).rows.push(r);
  });
  const list = [...groups.values()];
  if (by === 'person') list.sort((a, b) => (a.member?.name ?? '').localeCompare(b.member?.name ?? ''));
  return list; // history is already newest first, so the day groups are too
}

// Total: income and outcome side by side for one period, and the history
// behind them by person or by date.
export default function TotalPage() {
  const page = useFinancePage('/finance/total', ['income:changed', 'outcome:changed']);
  const [by, setBy] = useState('person');
  return (
    <FinancePage
      page={page}
      noun="total"
      body={(data) => <TotalBody data={data} group={page.period.group} currency={page.currency} by={by} setBy={setBy} />}
    />
  );
}

function TotalBody({ data, group, currency, by, setBy }) {
  const { money, convert } = currency;
  const p = data.period;
  const net = signed(convert(data.net));
  // The chart and the history in the chosen currency.
  const rows = data.chart.map((c) => ({ id: c.member.id, name: nameOf(c.member), values: { income: convert(c.income), outcome: convert(c.outcome) } }));
  const history = data.history.map((r) => ({ ...r, amount: convert(r.amount) }));
  const recordCount = data.counts.income + data.counts.outcome;
  const groups = groupHistory(history, by);

  return (
    <>
      <div className="stat-row finance-stats">
        <div className="stat stat-good">
          <span className="stat-value">{money(data.income)}</span>
          <span className="muted small">Income · {data.counts.income} {data.counts.income === 1 ? 'record' : 'records'}</span>
        </div>
        <div className="stat stat-bad">
          <span className="stat-value">{money(data.outcome)}</span>
          <span className="muted small">Outcome · {data.counts.outcome} {data.counts.outcome === 1 ? 'record' : 'records'}</span>
        </div>
        <div className={`stat ${data.net < 0 ? 'stat-bad' : 'stat-good'}`}>
          <span className={`stat-value ${net.cls}`}>{net.text.replace(/^([+−])/, `$1${currency.symbol}`)}</span>
          <span className="muted small">Total · income − outcome</span>
        </div>
        <GroupTiles
          tiles={data.perGroup} selected={group}
          value={(g) => <span className={signed(g.net).cls}>{signed(convert(g.net)).text}</span>}
          caption={(g) => `${g.name} · +${money(g.income)} / −${money(g.outcome)}`}
        />
      </div>

      {rows.length > 0 && (
        <FinanceColumns
          title="Income vs outcome"
          periodLabel={`${p.label} · ${currency.code}`}
          rows={rows}
          series={SERIES}
          tag={netTags(rows)}
          emptyNote={`No income or outcome recorded for ${p.label}.`}
          tooltip={(row) => {
            const n = signed(row.values.income - row.values.outcome);
            return (
              <span className="tooltip-row tooltip-total">
                <span className="muted">Total</span>
                <span className={`tooltip-value ${n.cls}`}>{n.text}</span>
              </span>
            );
          }}
          detail={(row) => {
            const mine = history.filter((r) => String(r.member?.id) === String(row.id));
            return (
              <div className="income-detail">
                <div className="stat-row">
                  <div className="stat stat-good"><span className="stat-value">{formatAmount(row.values.income)}</span><span className="muted small">Income</span></div>
                  <div className="stat stat-bad"><span className="stat-value">{formatAmount(row.values.outcome)}</span><span className="muted small">Outcome</span></div>
                  <div className="stat"><span className={`stat-value ${signed(row.values.income - row.values.outcome).cls}`}>{signed(row.values.income - row.values.outcome).text}</span><span className="muted small">Total</span></div>
                </div>
                {/* The history is capped at the newest records, so an older member's may be cut. */}
                {mine.length ? <HistoryTable rows={mine} by="person" /> : <p className="muted small">{shownOf(history.length, recordCount) ? 'Their records are older than the ones listed here; choose a shorter period.' : 'Nothing recorded.'}</p>}
              </div>
            );
          }}
        />
      )}

      {!history.length && (
        <div className="empty-inline muted"><Icon name="coins" size={20} /> No income or outcome recorded for {p.label}.</div>
      )}

      {history.length > 0 && (
        <section className="card">
          <div className="report-section-head history-toolbar">
            <h3>History</h3>
            <span className="muted small">{formatAmount(recordCount)} {recordCount === 1 ? 'record' : 'records'}</span>
            <div className="segmented small-segmented" role="radiogroup" aria-label="Group history by">
              {[['person', 'By person'], ['date', 'By date']].map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={by === value} className={by === value ? 'on' : ''} onClick={() => setBy(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {shownOf(history.length, recordCount) && <p className="muted small list-note">{shownOf(history.length, recordCount)}</p>}
          {groups.map((g) => (
            <div key={g.key} className="history-group">
              <div className="history-head">
                {by === 'person' ? (
                  <>
                    <Avatar name={g.member?.name ?? '?'} role={g.member?.role ?? 'member'} size={24} />
                    <strong>{nameOf(g.member)}</strong>
                  </>
                ) : <DateTag value={g.date} utc muted={false} />}
                <span className="muted small">{g.rows.length} {g.rows.length === 1 ? 'record' : 'records'}</span>
                <Sums rows={g.rows} />
              </div>
              <HistoryTable rows={g.rows} by={by} />
            </div>
          ))}
        </section>
      )}
    </>
  );
}
