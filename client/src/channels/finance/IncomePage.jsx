import { formatAmount, formatDay } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import IncomeChart from './IncomeChart.jsx';
import FinanceToolbar from './FinanceToolbar.jsx';
import { useFinancePeriod, scopeLabel } from './useFinancePeriod.js';
import { useLiveData } from '../../useLiveData.js';

// Income for one period, for All or one group: totals, the planned vs real
// chart, income per member and the records. Records are history: they are
// shown as recorded and cannot be edited or deleted here.
export default function IncomePage() {
  const period = useFinancePeriod();
  const { data, error } = useLiveData(`/incomes?${period.query}`, ['income:changed']);

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page muted">Loading...</div>;
  const p = data.period;
  const top = data.perMember[0]?.amount ?? 0;

  return (
    <div className="page finance-page">
      <FinanceToolbar
        period={p}
        type={period.type} from={period.from} to={period.to}
        onType={period.setType} onRange={period.setRange}
        scope={scopeLabel(data, period, data.chart[0]?.member?.name, 'income')}
      />

      <div className="stat-row finance-stats">
        <div className="stat stat-good">
          <span className="stat-value">{formatAmount(data.total)}</span>
          <span className="muted small">Total income · {p.label}</span>
        </div>
        {/* One tile per group this role can see, so the groups sit side by side. */}
        {data.perGroup?.map((g) => (
          <div key={g.id} className={`stat role-border-boss${period.group === g.slug ? ' is-selected' : ''}`}>
            <span className="stat-value">{formatAmount(g.amount)}</span>
            <span className="muted small">{g.name} · {g.count} {g.count === 1 ? 'record' : 'records'}</span>
          </div>
        ))}
        <div className="stat role-border-member">
          <span className="stat-value">{data.incomes.length}</span>
          <span className="muted small">{data.incomes.length === 1 ? 'Record' : 'Records'}</span>
        </div>
      </div>

      {data.chart?.length > 0 && <IncomeChart rows={data.chart} periodLabel={p.label} />}

      {data.perMember.length > 1 && (
        <section className="card">
          <div className="report-section-head"><h3>Income per member</h3></div>
          <ul className="bar-list">
            {data.perMember.map((row) => (
              <li key={row.member?.id ?? 'unknown'}>
                <span className="bar-label">{row.member?.name ?? 'Unknown'}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${top ? (row.amount / top) * 100 : 0}%` }} />
                </span>
                <span className="bar-value">{formatAmount(row.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!data.incomes.length && (
        <div className="empty-inline muted"><Icon name="coins" size={20} /> No income recorded for {p.label}.</div>
      )}

      {data.incomes.length > 0 && (
        <section className="card">
          <div className="report-section-head"><h3>Income records</h3></div>
          <table className="table finance-table">
            <thead>
              <tr><th>Date</th><th>Member</th><th>From</th><th className="num">Amount</th></tr>
            </thead>
            <tbody>
              {data.incomes.map((i) => (
                <tr key={i.id}>
                  <td data-label="Date">{formatDay(i.date)}</td>
                  <td data-label="Member">
                    <div className="cell-user">
                      <Avatar name={i.member?.name ?? '?'} role={i.member?.role ?? 'member'} size={26} />
                      <span>{i.member?.name}</span>
                    </div>
                  </td>
                  <td data-label="From">
                    {i.from}
                    {i.task && <span className="tag task-tag">{i.task.name}</span>}
                    {i.note && <div className="muted small">{i.note}</div>}
                  </td>
                  <td data-label="Amount" className="num strong">{formatAmount(i.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td className="strong">Total</td><td colSpan={2} /><td className="num strong">{formatAmount(data.total)}</td></tr>
            </tfoot>
          </table>
        </section>
      )}

    </div>
  );
}
