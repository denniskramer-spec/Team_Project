import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useSocketEvent } from '../../socket/SocketContext.jsx';
import { formatAmount, timeAgo } from '../../format.js';
import Icon from '../../components/Icon.jsx';
import Avatar from '../../components/Avatar.jsx';
import ReportForm from './ReportForm.jsx';
import TeamReports from './TeamReports.jsx';

// Reports are daily; the title says whose reports to show.
const TYPE = 'daily';

function GroupReports({ reports }) {
  if (!reports.length) return null;
  return (
    <section className="card">
      <div className="report-section-head"><h3>Group reports</h3></div>
      <ul className="group-report-list">
        {reports.map((r) => (
          <li key={r.id}>
            <div className="cell-user">
              <Avatar name={r.author?.name ?? '?'} role={r.author?.role ?? 'boss'} size={30} />
              <div>
                <div className="strong">{r.group?.name ?? 'Group'}</div>
                <div className="muted small">by {r.author?.name} · {timeAgo(r.updatedAt)}</div>
              </div>
            </div>
            <dl className="mini-stats">
              <div><dt>Job bids</dt><dd>{formatAmount(r.jobBid)}</dd></div>
              <div><dt>AI bids</dt><dd>{formatAmount(r.aiBid)}</dd></div>
              <div><dt>Income</dt><dd>{formatAmount(r.income)}</dd></div>
              <div><dt>Upcoming</dt><dd>{formatAmount(r.upcomingAmount)}</dd></div>
            </dl>
            {(r.upcomingNote || r.note) && (
              <div className="group-report-text">
                {r.upcomingNote && <p><span className="muted small">Upcoming note</span><br />{r.upcomingNote}</p>}
                {r.note && <p><span className="muted small">Note</span><br />{r.note}</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// `version` changes whenever a report is saved, so the strip stays current.
function History({ type, period, version, onPick }) {
  const [history, setHistory] = useState([]);
  useEffect(() => {
    api(`/reports/history?type=${type}`).then((d) => setHistory(d.history)).catch(() => setHistory([]));
  }, [type, period, version]);
  if (!history.length) return null;

  return (
    <section className="card history">
      <div className="report-section-head"><h3>Your recent reports</h3></div>
      <ul className="history-list">
        {history.map((h) => (
          <li key={h.period}>
            <button
              className={`history-item ${h.report ? 'done' : ''} ${h.period === period ? 'current' : ''}`}
              onClick={() => onPick(h.period)}
            >
              <Icon name={h.report ? 'check' : 'dot'} size={14} />
              <span>{h.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ReportChannel({ title }) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const type = TYPE;
  const period = searchParams.get('p') || '';
  // "me" is a member's own report; otherwise the title is the group.
  const group = title.key === 'me' ? 'all' : title.key;
  const member = searchParams.get('m') || '';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('mine');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ type, group });
      if (period) params.set('period', period);
      if (member) params.set('member', member);
      const d = await api(`/reports?${params}`);
      setData(d);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [type, period, group, member]);

  useEffect(() => { load(); }, [load]);
  useSocketEvent('report:changed', (e) => { if (e.type === type) load(); });

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page muted">Loading...</div>;

  const { can, period: p } = data;

  return (
    <div className="page report-page">
      <div className="toolbar period-bar">
        <button className="icon-btn" onClick={() => setParam('p', p.prev)} aria-label="Previous period">
          <Icon name="chevronLeft" />
        </button>
        <div className="period-label">
          <strong>{p.label}</strong>
          <span className="muted small">Daily report</span>
        </div>
        <button className="icon-btn" onClick={() => setParam('p', p.next)} aria-label="Next period" disabled={!p.hasNext}>
          <Icon name="chevronRight" />
        </button>
        {!p.isCurrent && <button className="btn small-btn" onClick={() => setParam('p', '')}>Current</button>}
        <span className="muted small scope-label">
          {member
            ? data.rows[0]?.member.name ?? 'Member'
            : data.scope === 'self' ? 'Your report'
              : data.scope === 'group' ? (data.groups[0]?.name ?? 'Your group')
                : group === 'all' ? 'All members' : data.groups.find((g) => g.slug === group)?.name ?? group}
        </span>
      </div>

      {can.writeGroup && (
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>My report</button>
          <button role="tab" aria-selected={tab === 'group'} className={tab === 'group' ? 'on' : ''} onClick={() => setTab('group')}>Group report</button>
        </div>
      )}

      {can.writePersonal && tab === 'mine' && (
        <ReportForm
          title="My daily report"
          type={type}
          period={p.key}
          report={data.mine}
          onSaved={load}
        />
      )}
      {can.writeGroup && tab === 'group' && (
        <ReportForm
          title={`${user.group?.name ?? 'Group'} report`}
          type={type}
          period={p.key}
          scope="group"
          report={data.myGroupReport}
          onSaved={load}
        />
      )}

      {!can.writePersonal && (
        <div className="note">
          <Icon name="clipboard" size={16} />
          <span>
            As {user.role === 'leader' ? 'team leader' : 'admin'} you read every member's report.
            Only the member who wrote a report can change it.
          </span>
        </div>
      )}

      <GroupReports reports={data.groupReports} />
      <TeamReports rows={data.rows} totals={data.totals} />
      {can.writePersonal && (
        <History type={type} period={p.key} version={data.mine?.updatedAt ?? ''} onPick={(key) => setParam('p', key)} />
      )}
    </div>
  );
}
