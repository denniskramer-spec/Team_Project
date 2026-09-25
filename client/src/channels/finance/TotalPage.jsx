import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useSocketEvent } from '../../socket/SocketContext.jsx';
import { formatAmount, formatDay, toDateInput } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import FinanceColumns from './FinanceColumns.jsx';
import FinanceToolbar from './FinanceToolbar.jsx';
import { useFinancePeriod, scopeLabel } from './useFinancePeriod.js';

const SERIES = [
  { key: 'income', label: 'Income', color: 'var(--series-3)' },
  { key: 'outcome', label: 'Outcome', color: 'var(--series-2)' },
];

// "+1,234" or "−567", with the class that colours it.
const signed = (n) => ({ text: `${n < 0 ? '−' : '+'}${formatAmount(Math.abs(n))}`, cls: n < 0 ? 'net-bad' : 'net-good' });

// Net above each member's pair of columns. The best and worst net this
// period get the Top / Lowest highlight, like the Income chart: everyone
// tied is tagged, nothing is tagged with one person or when all are equal.
const netOf = (row) => row.values.income - row.values.outcome;
function netTag(row, rows) {
  const net = netOf(row);
  const nets = rows.map(netOf);
  const best = Math.max(...nets);
  const worst = Math.min(...nets);
  const ranked = rows.length > 1 && best !== worst;
  if (ranked && net === best) return { text: `★ Top ${signed(net).text}`, cls: 'top', color: 'var(--series-3)' };
  if (ranked && net === worst) return { text: `▼ Lowest ${signed(net).text}`, cls: 'low', color: 'var(--status-warning)' };
  if (!row.values.income && !row.values.outcome) return null;
  return { text: signed(net).text, cls: 'net', color: net < 0 ? 'var(--series-2)' : 'var(--series-3)' };
}

// Income and outcome rows in one table. `by` decides the first column:
// the date when grouped by person, the member when grouped by date.
function HistoryTable({ rows, by }) {
  return (
    <table className="table finance-table history-table">
      <thead>
        <tr>
          <th>{by === 'person' ? 'Date' : 'For'}</th>
          <th>Type</th>
          <th>Detail</th>
          <th className="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.kind}-${r.id}`}>
            <td data-label={by === 'person' ? 'Date' : 'Member'}>
              {by === 'person' ? formatDay(r.date) : (
                <div className="cell-user">
                  <Avatar name={r.member?.name ?? '?'} role={r.member?.role ?? 'member'} size={26} />
                  <span>{r.member?.name}</span>
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
  const period = useFinancePeriod();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [by, setBy] = useState('person');

  const load = useCallback(async () => {
    try {
      setData(await api(`/finance/total?${period.query}`));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [period.query]);

  useEffect(() => { load(); }, [load]);
  useSocketEvent('income:changed', load);
  useSocketEvent('outcome:changed', load);

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page muted">Loading...</div>;
  const p = data.period;
  const net = signed(data.net);
  const rows = data.chart.map((c) => ({ id: c.member.id, name: c.member.name, values: { income: c.income, outcome: c.outcome } }));
  const groups = groupHistory(data.history, by);

  return (
    <div className="page finance-page">
      <FinanceToolbar
        period={p}
        type={period.type} from={period.from} to={period.to}
        onType={period.setType} onRange={period.setRange}
        scope={scopeLabel(data, period, data.chart[0]?.member?.name, 'total')}
      />

      <div className="stat-row finance-stats">
        <div className="stat stat-good">
          <span className="stat-value">{formatAmount(data.income)}</span>
          <span className="muted small">Income · {data.counts.income} {data.counts.income === 1 ? 'record' : 'records'}</span>
        </div>
        <div className="stat stat-bad">
          <span className="stat-value">{formatAmount(data.outcome)}</span>
          <span className="muted small">Outcome · {data.counts.outcome} {data.counts.outcome === 1 ? 'record' : 'records'}</span>
        </div>
        <div className={`stat ${data.net < 0 ? 'stat-bad' : 'stat-good'}`}>
          <span className={`stat-value ${net.cls}`}>{net.text}</span>
          <span className="muted small">Total · income − outcome</span>
        </div>
        {data.perGroup?.map((g) => (
          <div key={g.id} className={`stat role-border-boss${period.group === g.slug ? ' is-selected' : ''}`}>
            <span className={`stat-value ${signed(g.net).cls}`}>{signed(g.net).text}</span>
            <span className="muted small">{g.name} · +{formatAmount(g.income)} / −{formatAmount(g.outcome)}</span>
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <FinanceColumns
          title="Income vs outcome"
          periodLabel={p.label}
          rows={rows}
          series={SERIES}
          tag={netTag}
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
            const mine = data.history.filter((r) => String(r.member?.id) === String(row.id));
            return (
              <div className="income-detail">
                <div className="stat-row">
                  <div className="stat stat-good"><span className="stat-value">{formatAmount(row.values.income)}</span><span className="muted small">Income</span></div>
                  <div className="stat stat-bad"><span className="stat-value">{formatAmount(row.values.outcome)}</span><span className="muted small">Outcome</span></div>
                  <div className="stat"><span className={`stat-value ${signed(row.values.income - row.values.outcome).cls}`}>{signed(row.values.income - row.values.outcome).text}</span><span className="muted small">Total</span></div>
                </div>
                {mine.length ? <HistoryTable rows={mine} by="person" /> : <p className="muted small">Nothing recorded.</p>}
              </div>
            );
          }}
        />
      )}

      {!data.history.length && (
        <div className="empty-inline muted"><Icon name="coins" size={20} /> No income or outcome recorded for {p.label}.</div>
      )}

      {data.history.length > 0 && (
        <section className="card">
          <div className="report-section-head history-toolbar">
            <h3>History</h3>
            <span className="muted small">{data.history.length} {data.history.length === 1 ? 'record' : 'records'}</span>
            <div className="segmented small-segmented" role="radiogroup" aria-label="Group history by">
              {[['person', 'By person'], ['date', 'By date']].map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={by === value} className={by === value ? 'on' : ''} onClick={() => setBy(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {groups.map((g) => (
            <div key={g.key} className="history-group">
              <div className="history-head">
                {by === 'person' ? (
                  <>
                    <Avatar name={g.member?.name ?? '?'} role={g.member?.role ?? 'member'} size={28} />
                    <strong>{g.member?.name ?? 'Unknown'}</strong>
                  </>
                ) : <strong>{formatDay(g.date)}</strong>}
                <span className="muted small">{g.rows.length} {g.rows.length === 1 ? 'record' : 'records'}</span>
                <Sums rows={g.rows} />
              </div>
              <HistoryTable rows={g.rows} by={by} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
