import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useSocketEvent } from '../../socket/SocketContext.jsx';
import { formatAmount } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { STATUSES } from '../plan/StatusPicker.jsx';
import BarCompare from './BarCompare.jsx';

const TYPES = ['weekly', 'monthly', 'yearly'];

function PlanResults({ states, total }) {
  if (!total) return null;
  return (
    <figure className="chart">
      <figcaption><h3>Plan results</h3><span className="chart-share">{states.done} of {total} done</span></figcaption>
      <div className="meter" role="img" aria-label={STATUSES.map((s) => `${s.label}: ${states[s.key] || 0}`).join(', ')}>
        {STATUSES.map((s) => (states[s.key] ? (
          <span key={s.key} className={`meter-part ${s.key}`} style={{ flexGrow: states[s.key] }} />
        ) : null))}
      </div>
      <ul className="result-legend">
        {STATUSES.map((s) => (
          <li key={s.key}>
            <Icon name={s.icon} size={14} className={`legend-icon ${s.key}`} />
            <span className="strong">{states[s.key] || 0}</span>
            <span className="muted small">{s.label}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export default function CheckoutChannel({ title }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const type = TYPES.includes(title.key) ? title.key : 'weekly';
  const period = searchParams.get('p') || '';
  const group = searchParams.get('g') || 'all';
  const member = searchParams.get('m') || '';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ type, group });
      if (period) params.set('period', period);
      if (member) params.set('member', member);
      setData(await api(`/checkout?${params}`));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [type, period, group, member]);

  useEffect(() => { load(); }, [load]);
  // Checkout reads the other channels, so any of their changes refresh it.
  useSocketEvent('plan:changed', load);
  useSocketEvent('report:changed', load);
  useSocketEvent('task:changed', load);
  useSocketEvent('income:changed', load);

  const setPeriod = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('p', value); else next.delete('p');
    setSearchParams(next, { replace: true });
  };

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page muted">Loading...</div>;

  const p = data.period;
  const planTotal = Object.values(data.planStates).reduce((a, b) => a + b, 0);
  const nothing = !data.counts.plans && !data.counts.reports && !data.counts.tasks && !data.counts.incomes;

  return (
    <div className="page checkout-page">
      <div className="toolbar period-bar">
        <button className="icon-btn" onClick={() => setPeriod(p.prev)} aria-label="Previous period"><Icon name="chevronLeft" /></button>
        <div className="period-label">
          <strong>{p.label}</strong>
          <span className="muted small">
            {member ? data.rows[0]?.member.name ?? 'Member'
              : data.scope === 'self' ? 'Your results'
                : data.scope === 'group' ? 'Your group'
                  : group === 'all' ? 'All members' : data.groups.find((g) => g.slug === group)?.name ?? group}
          </span>
        </div>
        <button className="icon-btn" onClick={() => setPeriod(p.next)} aria-label="Next period" disabled={!p.hasNext}><Icon name="chevronRight" /></button>
        {!p.isCurrent && <button className="btn small-btn" onClick={() => setPeriod('')}>Current</button>}
        <span className="muted small scope-label">
          {data.counts.plans} plans · {data.counts.reports} reports · {data.counts.tasks} tasks · {data.counts.incomes} income records
        </span>
      </div>

      {nothing && (
        <div className="empty-inline muted">
          <Icon name="chart" size={20} /> Nothing recorded for {p.label} yet. Checkout fills up from the Plan, Report, Task and Finance channels.
        </div>
      )}

      <div className="chart-row">
        <BarCompare
          title="Income"
          series={[
            { label: 'Planned', value: data.income.planned, slot: 1, target: true },
            { label: 'Reported', value: data.income.reported, slot: 2 },
            { label: 'Received', value: data.income.actual, slot: 3, achieved: true },
          ]}
          note="Planned from Plan · Reported from Report · Received from Finance"
        />
        <BarCompare
          title="Job bids"
          unit="bids"
          series={[
            { label: 'Planned', value: data.jobBid.planned, slot: 1, target: true },
            { label: 'Reported', value: data.jobBid.reported, slot: 2, achieved: true },
          ]}
          note="Planned from Plan · Reported from Report"
        />
        <BarCompare
          title="AI training bids"
          unit="bids"
          series={[
            { label: 'Planned', value: data.aiBid.planned, slot: 1, target: true },
            { label: 'Reported', value: data.aiBid.reported, slot: 2, achieved: true },
          ]}
          note="Planned from Plan · Reported from Report"
        />
      </div>
      <div className="chart-pair">
        <PlanResults states={data.planStates} total={planTotal} />
        <figure className="chart">
          <figcaption><h3>Tasks</h3><span className="chart-share">{data.task.done} of {data.task.total} done</span></figcaption>
          <div className="meter" role="img" aria-label={`${data.task.done} of ${data.task.total} tasks done`}>
            {data.task.done > 0 && <span className="meter-part done" style={{ flexGrow: data.task.done }} />}
            {data.task.total - data.task.done > 0 && (
              <span className="meter-part not_done" style={{ flexGrow: data.task.total - data.task.done }} />
            )}
          </div>
          <ul className="result-legend">
            <li><Icon name="check" size={14} className="legend-icon done" /><span className="strong">{data.task.done}</span><span className="muted small">Done</span></li>
            <li><Icon name="dot" size={14} className="legend-icon not_done" /><span className="strong">{data.task.total - data.task.done}</span><span className="muted small">Open</span></li>
            <li><Icon name="coins" size={14} className="legend-icon" /><span className="strong">{formatAmount(data.task.salary)}</span><span className="muted small">Salary</span></li>
          </ul>
          <p className="muted small chart-note">From the Task channel, for tasks running in this period</p>
        </figure>
      </div>

      {data.rows.length > 0 && (
        <section className="card">
          <div className="report-section-head">
            <h3>Per member</h3>
            <span className="muted small">Task salary in period: {formatAmount(data.task.salary)}</span>
          </div>
          <table className="table checkout-table">
            <thead>
              <tr>
                <th>Member</th>
                <th className="num">Income plan</th>
                <th className="num">Reported</th>
                <th className="num">Received</th>
                <th className="num">Job bids p/r</th>
                <th className="num">AI bids p/r</th>
                <th className="num">Tasks done</th>
                <th>Plans</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.member.id}>
                  <td data-label="Member">
                    <div className="cell-user">
                      <Avatar name={row.member.name} role={row.member.role} size={28} />
                      <div>
                        <div className="strong">{row.member.name}</div>
                        <div className="muted small">{row.member.group?.name ?? '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Income plan" className="num">{formatAmount(row.planned.income)}</td>
                  <td data-label="Reported" className="num">{formatAmount(row.reported.income)}</td>
                  <td data-label="Received" className={`num strong ${row.actualIncome >= row.planned.income && row.planned.income > 0 ? 'hit' : ''}`}>
                    {formatAmount(row.actualIncome)}
                  </td>
                  <td data-label="Job bids p/r" className="num">{formatAmount(row.planned.jobBid)} / {formatAmount(row.reported.jobBid)}</td>
                  <td data-label="AI bids p/r" className="num">{formatAmount(row.planned.aiBid)} / {formatAmount(row.reported.aiBid)}</td>
                  <td data-label="Tasks done" className="num">{row.tasks.done} / {row.tasks.total}</td>
                  <td data-label="Plans">
                    <span className="plan-dots" title={STATUSES.map((s) => `${s.label}: ${row.planStates[s.key] || 0}`).join(', ')}>
                      {STATUSES.map((s) => (row.planStates[s.key] ? (
                        <span key={s.key} className={`plan-dot ${s.key}`}>{row.planStates[s.key]}</span>
                      ) : null))}
                      {!Object.values(row.planStates).some(Boolean) && <span className="muted small">no plan</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
