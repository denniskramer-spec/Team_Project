import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useReconnect, useSocketEvent } from '../../socket/SocketContext.jsx';
import { useToast } from '../../components/Toast.jsx';
import { formatAmount } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import PlanForm from './PlanForm.jsx';
import StatusPicker, { STATUSES, StatusPill } from './StatusPicker.jsx';
import { useLatestRequest } from '../../useLiveData.js';

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

// One target with what the daily reports have reached so far.
function Target({ item, target, achieved }) {
  const pct = target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : 0;
  const hit = target > 0 && achieved >= target;
  return (
    <li className={`target${hit ? ' hit' : ''}${!target ? ' none' : ''}`}>
      <span className="target-label">{item.label}</span>
      <span className="target-nums"><strong>{formatAmount(achieved)}</strong><span className="muted"> / {target ? formatAmount(target) : '—'}</span></span>
      <span className="target-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
    </li>
  );
}

// One member's (or group's) plan for the period: targets and progress.
function PlanCard({ plan, items, onStatus }) {
  const [open, setOpen] = useState(false);
  const groups = [...new Set(items.map((i) => i.group))];
  const withTarget = items.filter((i) => plan.targets[i.key] > 0);
  const hits = withTarget.filter((i) => (plan.achieved?.[i.key] ?? 0) >= plan.targets[i.key]).length;
  return (
    <section className={`card plan-card${plan.scope === 'group' ? ' group-plan' : ''}`}>
      <div className="plan-card-head">
        <Avatar name={plan.owner?.name ?? '?'} role={plan.owner?.role ?? 'member'} size={24} />
        <div className="plan-card-who">
          <div className="strong">
            {plan.scope === 'group' ? `${plan.group?.name ?? 'Group'} plan` : plan.owner?.name}
            {plan.mine && <span className="muted small"> (you)</span>}
          </div>
          <div className="muted small">
            {plan.scope === 'group' ? `by ${plan.owner?.name}` : plan.group?.name ?? '—'}
            {withTarget.length > 0 && ` · ${hits} of ${withTarget.length} targets reached`}
          </div>
        </div>
        {plan.mine
          ? <StatusPicker value={plan.status} onChange={(s) => onStatus(plan, s)} size="small" />
          : <StatusPill status={plan.status} />}
      </div>
      <div className="plan-card-groups">
        {groups.map((g) => (
          <ul key={g} className="target-list">
            <li className="rm-section-title target-group">{g}</li>
            {items.filter((i) => i.group === g).map((i) => (
              <Target key={i.key} item={i} target={plan.targets[i.key]} achieved={plan.achieved?.[i.key] ?? 0} />
            ))}
          </ul>
        ))}
      </div>
      {plan.note && (
        <div className="plan-card-note">
          <button type="button" className="link small" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} /> Note
          </button>
          {open && <p className="muted small pre-wrap">{plan.note}</p>}
        </div>
      )}
    </section>
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

  const track = useLatestRequest();
  const load = useCallback(async () => {
    const isLatest = track();
    try {
      const params = new URLSearchParams({ type, group });
      if (period) params.set('period', period);
      if (member) params.set('member', member);
      const result = await api(`/plans?${params}`);
      if (!isLatest()) return;
      setData(result);
      setError('');
    } catch (err) {
      if (isLatest()) setError(err.message);
    }
  }, [track, type, period, group, member]);

  useEffect(() => { load(); }, [load]);
  useReconnect(load);
  useSocketEvent('plan:changed', (e) => { if (e.type === type) load(); });
  // Reports change what has been achieved.
  useSocketEvent('report:changed', load);

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

  const { can, period: p, items } = data;
  const selected = member ? data.plans.find((pl) => pl.owner?.id === member)?.owner : null;
  const scopeLabel = selected?.name
    ?? (data.scope === 'self' ? 'Your plans' : group === 'all' ? (data.scope === 'group' ? 'Your group' : 'All members') : data.groups.find((g) => g.slug === group)?.name ?? group);
  const others = data.plans.filter((pl) => !(pl.mine && pl.scope === 'personal'));

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
            <div className="plan-mine">
              <PlanForm title={`My ${type} plan`} type={type} period={p.key} plan={data.mine} items={items} onSaved={load} />
              {data.mine && <PlanCard plan={data.mine} items={items} onStatus={setStatus} />}
            </div>
          )}
          {can.planGroup && tab === 'group' && (
            <div className="plan-mine">
              <PlanForm title={`${user.group?.name ?? 'Group'} plan`} type={type} period={p.key} scope="group" plan={data.myGroupPlan} items={items} onSaved={load} />
              {data.myGroupPlan && <PlanCard plan={data.myGroupPlan} items={items} onStatus={setStatus} />}
            </div>
          )}
        </>
      )}
      {!can.plan && (
        <div className="note">
          <Icon name="target" size={16} />
          <span>Members and bosses set the targets; what their daily reports add up to shows against each one.</span>
        </div>
      )}

      {data.scope !== 'self' && <ResultSummary counts={data.counts} />}

      {others.length > 0 && (
        <section className="plan-others">
          <div className="report-section-head">
            <h3>{data.scope === 'self' ? 'Group plan' : 'Plans'}</h3>
            <span className="muted small">
              Team: {formatAmount(data.achievedTotals.jobBid)} / {formatAmount(data.totals.jobBid)} applied · {formatAmount(data.achievedTotals.income)} / {formatAmount(data.totals.income)} income
            </span>
          </div>
          <div className="plan-grid">
            {others.map((plan) => <PlanCard key={plan.id} plan={plan} items={items} onStatus={setStatus} />)}
          </div>
        </section>
      )}

      {data.missing.length > 0 && data.scope !== 'self' && (
        <section className="card">
          <div className="report-section-head"><h3>No plan yet</h3><span className="muted small">{data.missing.length}</span></div>
          <ul className="missing-list">
            {data.missing.map((m) => (
              <li key={m.id}>
                <Avatar name={m.name} role={m.role} size={18} />
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
