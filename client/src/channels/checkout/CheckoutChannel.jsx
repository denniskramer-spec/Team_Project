import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatAmount, nameOf, todayInput } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { STATUSES } from '../plan/StatusPicker.jsx';
import BarCompare, { linkProps } from './BarCompare.jsx';
import CheckoutDetail from './CheckoutDetail.jsx';
import { useSort, Th } from '../../components/SortTable.jsx';
import { useLiveData } from '../../useLiveData.js';
import { scopeLabel } from '../finance/useFinancePeriod.js';

const TYPES = ['weekly', 'monthly', 'yearly'];

function PlanResults({ states, total, onOpen }) {
  if (!total) return null;
  return (
    <figure className="chart chart-link" {...linkProps(onOpen, 'Plan results')}>
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

const EMPTY = [];
const COLUMNS = {
  member: (r) => nameOf(r.member),
  planned: { by: (r) => r.planned.income, desc: true },
  reported: { by: (r) => r.reported.income, desc: true },
  upcoming: { by: (r) => r.upcoming, desc: true },
  received: { by: (r) => r.actualIncome, desc: true },
  jobBids: { by: (r) => r.reported.jobBid, desc: true },
  aiBids: { by: (r) => r.reported.aiBid, desc: true },
  projects: { by: (r) => r.tasks.done, desc: true },
  plans: { by: (r) => Object.values(r.planStates).reduce((a, b) => a + b, 0), desc: true },
};

export default function CheckoutChannel({ title }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const type = TYPES.includes(title.key) ? title.key : 'weekly';
  const period = searchParams.get('p') || '';
  const group = searchParams.get('g') || 'all';
  const member = searchParams.get('m') || '';
  const [detail, setDetail] = useState(null);

  const params = new URLSearchParams({ type, group });
  // Without a period, the current one around the user's own calendar day
  // (in the evening west of Greenwich the server is already on tomorrow).
  if (period) params.set('period', period); else params.set('date', todayInput());
  if (member) params.set('member', member);
  // Checkout reads the other channels, so any of their changes refresh it.
  const { data, error } = useLiveData(`/checkout?${params}`, ['plan:changed', 'report:changed', 'task:changed', 'income:changed']);
  const sorter = useSort(data?.rows ?? EMPTY, COLUMNS);

  const setPeriod = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('p', value); else next.delete('p');
    setSearchParams(next, { replace: true });
  };

  // A period or group the server refuses still leaves a way back.
  if (error) {
    return (
      <div className="page">
        <div className="alert error">{error}</div>
        {period && <button className="btn small-btn" onClick={() => setPeriod('')}>Back to the current period</button>}
      </div>
    );
  }
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
          <span className="muted small">{scopeLabel(data, { group, member }, data.rows[0]?.member.name, 'results')}</span>
        </div>
        <button className="icon-btn" onClick={() => setPeriod(p.next)} aria-label="Next period" disabled={!p.hasNext}><Icon name="chevronRight" /></button>
        {!p.isCurrent && <button className="btn small-btn" onClick={() => setPeriod('')}>Current</button>}
        <span className="muted small scope-label">
          {data.counts.plans} plans · {data.counts.reports} reports · {data.counts.tasks} projects · {data.counts.incomes} income records
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
          onOpen={() => setDetail('income')}
          series={[
            { label: 'Planned', value: data.income.planned, slot: 1, target: true },
            { label: 'Reported', value: data.income.reported, slot: 2 },
            { label: 'Received', value: data.income.actual, slot: 3, achieved: true },
          ]}
          note={`Planned from Plan · Reported is what the daily reports' hours and tasks earned${data.income.upcoming > 0 ? ` (${formatAmount(data.income.upcoming)} not paid yet)` : ''} · Received from Finance`}
        />
        <BarCompare
          title="Job bids"
          onOpen={() => setDetail('jobBid')}
          unit="bids"
          series={[
            { label: 'Planned', value: data.jobBid.planned, slot: 1, target: true },
            { label: 'Reported', value: data.jobBid.reported, slot: 2, achieved: true },
          ]}
          note="Planned from Plan · Reported from Report"
        />
        <BarCompare
          title="AI training bids"
          onOpen={() => setDetail('aiBid')}
          unit="bids"
          series={[
            { label: 'Planned', value: data.aiBid.planned, slot: 1, target: true },
            { label: 'Reported', value: data.aiBid.reported, slot: 2, achieved: true },
          ]}
          note="Planned from Plan · Reported from Report"
        />
      </div>
      <div className="chart-pair">
        <PlanResults states={data.planStates} total={planTotal} onOpen={() => setDetail('plans')} />
        <figure className="chart chart-link" {...linkProps(() => setDetail('projects'), 'Projects')}>
          <figcaption><h3>Projects</h3><span className="chart-share">{data.task.done} of {data.task.total} done</span></figcaption>
          <div className="meter" role="img" aria-label={`${data.task.done} of ${data.task.total} projects done`}>
            {data.task.done > 0 && <span className="meter-part done" style={{ flexGrow: data.task.done }} />}
            {data.task.total - data.task.done > 0 && (
              <span className="meter-part not_done" style={{ flexGrow: data.task.total - data.task.done }} />
            )}
          </div>
          <ul className="result-legend">
            <li><Icon name="check" size={14} className="legend-icon done" /><span className="strong">{data.task.done}</span><span className="muted small">Done</span></li>
            <li><Icon name="dot" size={14} className="legend-icon not_done" /><span className="strong">{data.task.total - data.task.done}</span><span className="muted small">Open</span></li>
            <li><Icon name="coins" size={14} className="legend-icon" /><span className="strong">{formatAmount(data.task.price)}</span><span className="muted small">Price</span></li>
          </ul>
          <p className="muted small chart-note">From the Projects channel, for projects running in this period</p>
        </figure>
      </div>

      {detail && <CheckoutDetail kind={detail} details={data.details} periodLabel={p.label} onClose={() => setDetail(null)} />}

      {data.rows.length > 0 && (
        <section className="card">
          <div className="report-section-head">
            <h3>Per member</h3>
            <span className="muted small">Project prices in period: {formatAmount(data.task.price)}</span>
          </div>
          <table className="table checkout-table">
            <thead>
              <tr>
                <Th sort={sorter} col="member">Member</Th>
                <Th sort={sorter} col="planned" className="num">Income plan</Th>
                <Th sort={sorter} col="reported" className="num">Reported</Th>
                <Th sort={sorter} col="upcoming" className="num">Upcoming</Th>
                <Th sort={sorter} col="received" className="num">Received</Th>
                <Th sort={sorter} col="jobBids" className="num">Job bids p/r</Th>
                <Th sort={sorter} col="aiBids" className="num">AI bids p/r</Th>
                <Th sort={sorter} col="projects" className="num">Projects done</Th>
                <Th sort={sorter} col="plans">Plans</Th>
              </tr>
            </thead>
            <tbody>
              {sorter.rows.map((row) => (
                <tr key={row.member.id}>
                  <td data-label="Member">
                    <div className="cell-user">
                      <Avatar name={row.member.name} role={row.member.role} size={24} />
                      <div>
                        <div className="strong">{nameOf(row.member)}</div>
                        <div className="muted small">{row.member.group?.name ?? '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Income plan" className="num">{formatAmount(row.planned.income)}</td>
                  <td data-label="Reported" className="num">{formatAmount(row.reported.income)}</td>
                  <td data-label="Upcoming" className="num">{row.upcoming > 0 ? <span className="upcoming-amt">{formatAmount(row.upcoming)}</span> : <span className="muted">—</span>}</td>
                  <td data-label="Received" className={`num strong ${row.actualIncome >= row.planned.income && row.planned.income > 0 ? 'hit' : ''}`}>
                    {formatAmount(row.actualIncome)}
                  </td>
                  <td data-label="Job bids p/r" className="num">{formatAmount(row.planned.jobBid)} / {formatAmount(row.reported.jobBid)}</td>
                  <td data-label="AI bids p/r" className="num">{formatAmount(row.planned.aiBid)} / {formatAmount(row.reported.aiBid)}</td>
                  <td data-label="Projects done" className="num">{row.tasks.done} / {row.tasks.total}</td>
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
