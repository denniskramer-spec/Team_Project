import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { formatAmount, formatClock, timeAgo } from '../../format.js';
import Icon from '../../components/Icon.jsx';
import ReportModal from './ReportModal.jsx';
import BidGoals from './BidGoals.jsx';
import TeamReports from './TeamReports.jsx';
import { useLiveData } from '../../useLiveData.js';
import { EVENTS } from '../../constants.js';
import { planOf, stateOf, useTodayPlan } from './reportState.js';

// Reports are daily; the title says whose day to show.
const TYPE = 'daily';

// One card per group: its members' reports of the day added up.
function GroupReports({ groups }) {
  if (!groups.length) return null;
  return (
    <section className="team-reports">
      <div className="report-section-head"><h3>Group reports</h3><span className="muted small">Added up from the members' reports</span></div>
      <div className="report-cards group-cards">
        {groups.map((g) => (
          <article key={g.group.id} className={`card report-card ${g.expected && g.sent === g.expected ? 'sent' : g.sent ? 'draft' : 'missing'}`}>
            <header className="rc-head">
              <span className="rc-group-mark"><Icon name="users" size={14} /></span>
              <div className="rc-who">
                <div className="strong">{g.group.name}</div>
                <div className="muted small">{g.sent} of {g.expected} sent{g.drafts ? ` · ${g.drafts} draft` : ''}</div>
              </div>
              <span className={`status-pill ${g.expected && g.sent === g.expected ? 'active' : g.sent ? 'pending' : 'disabled'}`}>
                {g.expected && g.sent === g.expected ? 'Complete' : g.sent ? 'Partial' : 'Nothing yet'}
              </span>
            </header>
            <div className="rc-body">
              <div className="rc-block">
                <span className="rm-section-title">Bids</span>
                <dl className="rc-figures">
                  <div><dt>Applied</dt><dd>{formatAmount(g.totals.jobBid)}</dd></div>
                  <div><dt>AI bids</dt><dd>{formatAmount(g.totals.aiBid)}</dd></div>
                  <div><dt>Résumés</dt><dd>{formatAmount(g.totals.resumes)}</dd></div>
                  <div><dt>Forms</dt><dd>{formatAmount(g.totals.forms)}</dd></div>
                  <div><dt>Bidding h</dt><dd>{formatAmount(g.totals.biddingHours)}</dd></div>
                </dl>
              </div>
              <div className="rc-block">
                <span className="rm-section-title">Projects · calls</span>
                <dl className="rc-figures">
                  <div><dt>Projects written</dt><dd>{g.projectsWritten}</dd></div>
                  <div><dt>Hours</dt><dd>{formatAmount(g.hours)}</dd></div>
                  <div><dt>Calls</dt><dd>{g.calls}</dd></div>
                </dl>
              </div>
              <div className="rc-block">
                <span className="rm-section-title">Money</span>
                <dl className="rc-figures">
                  <div><dt>Earned</dt><dd title="What the reported hours and tasks are worth">{formatAmount(g.totals.earned)}</dd></div>
                  <div><dt>Upcoming</dt><dd title="Not paid yet">{formatAmount(g.totals.upcomingAmount)}</dd></div>
                </dl>
              </div>
              {g.issues.length > 0 && (
                <div className="rc-block">
                  <span className="rm-section-title">Issues / blockers</span>
                  <ul className="rc-list">
                    {g.issues.map((i) => <li key={i.member}><span className="strong">{i.member}</span><div className="pre-wrap small rc-issues">{i.text}</div></li>)}
                  </ul>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// The writer's recent days, kept current as reports are saved.
function History({ type, period, onPick }) {
  const { data, error } = useLiveData(`/reports/history?type=${type}`, [EVENTS.REPORT_CHANGED]);
  if (error) return <div className="alert error">{error}</div>;
  const history = data?.history ?? [];
  if (!history.length) return null;

  return (
    <section className="card history">
      <div className="report-section-head"><h3>Your recent reports</h3></div>
      <ul className="history-list">
        {history.map((h) => (
          <li key={h.period}>
            <button
              className={`history-item ${h.report?.sentAt ? 'done' : ''} ${h.period === period ? 'current' : ''}`}
              onClick={() => onPick(h.period)}
              title={h.report ? (h.report.sentAt ? 'Sent' : 'Draft') : 'Not written'}
            >
              <Icon name={h.report?.sentAt ? 'check' : 'dot'} size={14} />
              <span>{h.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The writer's own day: report status, today's plan, projects written.
function MyDay({ data, period, onWrite }) {
  const r = data.mine;
  // Memoised: the fallback builds a new list, and a new list each render
  // would reset the ticks on screen.
  const serverPlan = useMemo(() => planOf(r, data.previousPlan), [r, data.previousPlan]);
  const [plan, togglePlan] = useTodayPlan(serverPlan, period.key);
  const planDone = plan.filter((p) => p.done).length;
  const projects = data.projects ?? [];
  const written = new Set((r?.work ?? []).filter((w) => w.text?.trim()).map((w) => String(w.task.id)));
  const state = stateOf(r);

  return (
    <section className={`card my-day ${state}`}>
      <div className="my-day-head">
        <div>
          <h3>Daily report · {period.isCurrent ? 'today' : period.label}</h3>
          <span className="muted small">
            {state === 'sent' && `Sent ${formatClock(r.sentAt)} · last change ${timeAgo(r.updatedAt)}`}
            {state === 'draft' && `Draft saved ${formatClock(r.updatedAt)} · not sent yet`}
            {state === 'missing' && 'Not written yet'}
          </span>
        </div>
        <button className={`btn ${state === 'sent' ? '' : 'primary'}`} onClick={onWrite}>
          <Icon name="file" size={14} /> {state === 'sent' ? 'Open report' : state === 'draft' ? 'Finish report' : 'Write daily report'}
        </button>
      </div>
      <div className="my-day-grid">
        <div>
          <div className="field-label">Today's plan <span className="muted">· {planDone}/{plan.length} done</span></div>
          {plan.length === 0 && <p className="muted small">Nothing planned. Write tomorrow's plan in the report and it shows up here the next day.</p>}
          <ul className="rm-checklist">
            {plan.map((p, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <li key={i}>
                <label className="check">
                  <input type="checkbox" checked={p.done} onChange={() => togglePlan(i)} />
                  <span className={p.done ? 'is-done' : ''}>{p.text}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="field-label">Projects <span className="muted">· {written.size} of {projects.length} written</span></div>
          {projects.length === 0 && <p className="muted small">No active projects. <Link to="/task">Register one</Link>.</p>}
          <ul className="my-day-projects">
            {projects.map((p) => (
              <li key={p.id}>
                <span className={`rm-dot${written.has(String(p.id)) ? ' on' : ''}`} />
                <span className="strong">{p.name}</span>
                <span className="muted small">{written.has(String(p.id)) ? 'written' : 'not written today'}</span>
              </li>
            ))}
          </ul>
          {data.goals && (
            <>
              <div className="field-label my-day-goals-title">Today's goals <span className="muted">· from your {data.goals.plan.type} plan</span></div>
              <BidGoals goals={data.goals} report={r} />
            </>
          )}
          {r && (
            <dl className="mini-stats my-day-stats">
              <div><dt>Applied</dt><dd>{formatAmount(r.jobBid)}</dd></div>
              <div><dt>Calls</dt><dd>{r.calls?.length ?? 0}</dd></div>
              <div><dt>Earned</dt><dd title="What the hours and tasks you reported are worth">{formatAmount(r.earned)}</dd></div>
              <div><dt>Upcoming</dt><dd title="Not paid yet: record the income in Finance to settle it">{formatAmount(r.upcomingAmount)}</dd></div>
            </dl>
          )}
        </div>
      </div>
    </section>
  );
}

// Section 3 for the Dashboard channel: the day at a glance. Writers get their
// own report status (and the report modal); bosses, the leader and admins
// see the team's reports for the day.
export default function ReportChannel({ title }) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const type = TYPE;
  const period = searchParams.get('p') || '';
  // "me" is a member's own day; otherwise the title is the group.
  const group = title.key === 'me' ? 'all' : title.key;
  const member = searchParams.get('m') || '';
  const [modal, setModal] = useState(searchParams.get('write') === '1' ? 'personal' : null);
  // "Write daily report" links (?write=1) open the modal while already here, too.
  const write = searchParams.get('write') === '1';
  useEffect(() => { if (write) setModal('personal'); }, [write]);

  const params = new URLSearchParams({ type, group });
  if (period) params.set('period', period);
  if (member) params.set('member', member);
  const { data, error, reload: load } = useLiveData(`/reports?${params}`, [EVENTS.REPORT_CHANGED]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  };
  const closeModal = () => { setModal(null); if (searchParams.get('write')) setParam('write', ''); };

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page muted">Loading...</div>;

  const { can, period: p } = data;

  return (
    <div className="page report-page">
      <div className="toolbar period-bar">
        <button className="icon-btn" onClick={() => setParam('p', p.prev)} aria-label="Previous day">
          <Icon name="chevronLeft" />
        </button>
        <div className="period-label">
          <strong>{p.label}</strong>
          <span className="muted small">Dashboard</span>
        </div>
        <button className="icon-btn" onClick={() => setParam('p', p.next)} aria-label="Next day" disabled={!p.hasNext}>
          <Icon name="chevronRight" />
        </button>
        {!p.isCurrent && <button className="btn small-btn" onClick={() => setParam('p', '')}>Today</button>}
        <span className="muted small scope-label">
          {member
            ? data.rows[0]?.member.name ?? 'Member'
            : data.scope === 'self' ? 'Your day'
              : data.scope === 'group' ? (data.groups[0]?.name ?? 'Your group')
                : group === 'all' ? 'All members' : data.groups.find((g) => g.slug === group)?.name ?? group}
        </span>
      </div>

      {can.writePersonal && <MyDay data={data} period={p} onWrite={() => setModal('personal')} />}

      {!can.writePersonal && (
        <div className="note">
          <Icon name="dashboard" size={16} />
          <span>
            As {user.role === 'leader' ? 'team leader' : 'admin'} you read every member's daily report.
            Only the member who wrote a report can change it.
          </span>
        </div>
      )}

      <GroupReports groups={data.groupSummaries} />
      <TeamReports rows={data.rows} totals={data.totals} />
      {can.writePersonal && (
        <History type={type} period={p.key} onPick={(key) => setParam('p', key)} />
      )}

      {modal && (
        <ReportModal
          period={p}
          report={data.mine}
          context={data}
          onClose={closeModal}
          onSaved={load}
          onPeriod={(key) => setParam('p', key)}
        />
      )}
    </div>
  );
}
