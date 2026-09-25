import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useSocketEvent } from '../../socket/SocketContext.jsx';
import { useToast } from '../../components/Toast.jsx';
import { formatAmount, timeAgo } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import PlanForm from './PlanForm.jsx';
import StatusPicker, { STATUSES, StatusPill } from './StatusPicker.jsx';

const PLAN_TYPES = ['weekly', 'monthly'];

// Result summary: counts per state plus one stacked meter.
function ResultSummary({ counts }) {
  const total = STATUSES.reduce((sum, s) => sum + (counts[s.key] || 0), 0);
  if (!total) return null;

  return (
    <section className="card result-summary">
      <div className="report-section-head">
        <h3>Result</h3>
        <span className="muted small">{counts.done || 0} of {total} done</span>
      </div>
      <div className="meter" role="img" aria-label={STATUSES.map((s) => `${s.label}: ${counts[s.key] || 0}`).join(', ')}>
        {STATUSES.map((s) => (counts[s.key] ? (
          <span key={s.key} className={`meter-part ${s.key}`} style={{ flexGrow: counts[s.key] }} />
        ) : null))}
      </div>
      <ul className="result-legend">
        {STATUSES.map((s) => (
          <li key={s.key}>
            <Icon name={s.icon} size={14} className={`legend-icon ${s.key}`} />
            <span className="strong">{counts[s.key] || 0}</span>
            <span className="muted small">{s.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlanRow({ plan, onStatus }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className={plan.scope === 'group' ? 'group-plan' : ''}>
        <td data-label="Owner">
          <div className="cell-user">
            <Avatar name={plan.owner?.name ?? '?'} role={plan.owner?.role ?? 'member'} size={30} />
            <div>
              <div className="strong">
                {plan.scope === 'group' ? `${plan.group?.name ?? 'Group'} plan` : plan.owner?.name}
                {plan.mine && <span className="muted small"> (you)</span>}
              </div>
              <div className="muted small">
                {plan.scope === 'group' ? `by ${plan.owner?.name}` : plan.group?.name ?? '—'}
              </div>
            </div>
          </div>
        </td>
        <td data-label="Job bids" className="num">{formatAmount(plan.jobBid)}</td>
        <td data-label="AI bids" className="num">{formatAmount(plan.aiBid)}</td>
        <td data-label="Income" className="num">{formatAmount(plan.income)}</td>
        <td data-label="Result">
          {plan.mine
            ? <StatusPicker value={plan.status} onChange={(s) => onStatus(plan, s)} size="small" />
            : <StatusPill status={plan.status} />}
        </td>
        <td className="cell-actions">
          {plan.note && (
            <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Plan note">
              <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} />
            </button>
          )}
        </td>
      </tr>
      {open && plan.note && (
        <tr className="detail-row"><td colSpan={6}><p>{plan.note}</p></td></tr>
      )}
    </>
  );
}

// Section 3 for the Plan channel. The title is the period type (weekly or
// monthly); the group and member come from the tree as ?g= and ?m=.
export default function PlanChannel({ title }) {
  const { user } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const type = PLAN_TYPES.includes(title.key) ? title.key : 'weekly';
  const period = searchParams.get('p') || '';
  const group = searchParams.get('g') || 'all';
  const member = searchParams.get('m') || '';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('mine');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ type, group });
      if (period) params.set('period', period);
      if (member) params.set('member', member);
      setData(await api(`/plans?${params}`));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [type, period, group, member]);

  useEffect(() => { load(); }, [load]);
  useSocketEvent('plan:changed', (e) => { if (e.type === type) load(); });

  const setPeriod = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('p', value); else next.delete('p');
    setSearchParams(next, { replace: true });
  };

  const setStatus = async (plan, status) => {
    try {
      await api(`/plans/${plan.id}/status`, { method: 'PATCH', body: { status } });
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page muted">Loading...</div>;

  const { can, period: p } = data;
  const selected = member ? data.plans.find((pl) => pl.owner?.id === member)?.owner : null;
  const scopeLabel = selected?.name
    ?? (data.scope === 'self' ? 'Your plans' : group === 'all' ? (data.scope === 'group' ? 'Your group' : 'All members') : data.groups.find((g) => g.slug === group)?.name ?? group);

  return (
    <div className="page plan-page">
      <div className="toolbar period-bar">
        <button className="icon-btn" onClick={() => setPeriod(p.prev)} aria-label="Previous period"><Icon name="chevronLeft" /></button>
        <div className="period-label">
          <strong>{p.label}</strong>
          <span className="muted small">{type} plan · {scopeLabel}</span>
        </div>
        <button className="icon-btn" onClick={() => setPeriod(p.next)} aria-label="Next period"><Icon name="chevronRight" /></button>
        {!p.isCurrent && <button className="btn small-btn" onClick={() => setPeriod('')}>Current</button>}
      </div>

      {/* Your own plan form, hidden while looking at someone else. */}
      {can.plan && !member && (
        <>
          {can.planGroup && (
            <div className="segmented" role="tablist">
              <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>My plan</button>
              <button role="tab" aria-selected={tab === 'group'} className={tab === 'group' ? 'on' : ''} onClick={() => setTab('group')}>Group plan</button>
            </div>
          )}
          {tab === 'mine' && (
            <PlanForm title={`My ${type} plan`} type={type} period={p.key} plan={data.mine} onSaved={load} />
          )}
          {can.planGroup && tab === 'group' && (
            <PlanForm title={`${user.group?.name ?? 'Group'} plan`} type={type} period={p.key} scope="group" plan={data.myGroupPlan} onSaved={load} />
          )}
        </>
      )}
      {!can.plan && (
        <div className="note">
          <Icon name="target" size={16} />
          <span>Members and bosses make the plans; you can follow their results here.</span>
        </div>
      )}

      <ResultSummary counts={data.counts} />

      {data.plans.length > 0 && (
        <section className="card">
          <div className="report-section-head">
            <h3>Plans</h3>
            <span className="muted small">
              Targets: {formatAmount(data.totals.jobBid)} job bids · {formatAmount(data.totals.aiBid)} AI bids · {formatAmount(data.totals.income)} income
            </span>
          </div>
          <table className="table plan-table">
            <thead>
              <tr><th>Owner</th><th className="num">Job bids</th><th className="num">AI bids</th><th className="num">Income</th><th>Result</th><th aria-label="Note" /></tr>
            </thead>
            <tbody>
              {data.plans.map((plan) => <PlanRow key={plan.id} plan={plan} onStatus={setStatus} />)}
            </tbody>
          </table>
        </section>
      )}

      {data.missing.length > 0 && (
        <section className="card">
          <div className="report-section-head"><h3>No plan yet</h3><span className="muted small">{data.missing.length}</span></div>
          <ul className="missing-list">
            {data.missing.map((m) => (
              <li key={m.id}>
                <Avatar name={m.name} role={m.role} size={26} />
                <span>{m.name}</span>
                <span className="muted small">{m.group?.name ?? '—'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!data.plans.length && !data.missing.length && (
        <div className="empty-inline muted"><Icon name="target" size={20} /> No plans for {p.label} yet.</div>
      )}
    </div>
  );
}
