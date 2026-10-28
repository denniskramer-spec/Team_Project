import { formatAmount, formatClock, timeAgo, nameOf } from '../../format.js';
import { stateOf } from './reportState.js';
import DateTag from '../../components/DateTag.jsx';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';

const RESULT = { well: 'Went well', mixed: 'Mixed', bad: "Didn't go well" };

// A labelled block of one member's report; hidden when there is nothing in it.
function Block({ title, meta, children, show = true }) {
  if (!show) return null;
  return (
    <div className="rc-block">
      <div className="rc-block-head">
        <span className="rm-section-title">{title}</span>
        {meta && <span className="muted small">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

// Numbers in a row: "Applied 98 · AI bids 4 · ..." — zeros left out.
function Figures({ pairs }) {
  const shown = pairs.filter(([, v]) => v);
  if (!shown.length) return <span className="muted small">—</span>;
  return (
    <dl className="rc-figures">
      {shown.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatAmount(value)}</dd></div>)}
    </dl>
  );
}

// One member's daily report as a card a manager can read at a glance.
function ReportCard({ row }) {
  const r = row.report;
  const state = stateOf(r);
  const plan = r?.todayPlan ?? [];
  const planDone = plan.filter((p) => p.done).length;
  const work = (r?.work ?? []).filter((w) => w.text?.trim() || w.hours || w.count);
  const calls = r?.calls ?? [];
  const bids = r ? [['Applied', r.jobBid], ['AI bids', r.aiBid], ['Résumés', r.resumes], ['Forms', r.forms], ['Bidding h', r.biddingHours]] : [];
  // Earned is what the day's hours and tasks are worth; upcoming the part not
  // paid yet. Reports from before projects had prices typed an income in.
  const money = r ? [['Earned', r.earned], ['Upcoming', r.upcomingAmount], ['Income', r.income]] : [];

  return (
    <article className={`card report-card ${state}`}>
      <header className="rc-head">
        <Avatar name={row.member.name} role={row.member.role} size={26} />
        <div className="rc-who">
          <div className={`strong role-text-${row.member.role}`}>{nameOf(row.member)}</div>
          <div className="muted small">
            {row.member.group?.name ?? '—'}
            {state === 'sent' && ` · sent ${formatClock(r.sentAt)}`}
            {state === 'draft' && ` · draft, saved ${timeAgo(r.updatedAt)}`}
          </div>
        </div>
        <span className={`status-pill ${state === 'sent' ? 'active' : state === 'draft' ? 'pending' : 'disabled'}`}>
          {state === 'sent' ? 'Sent' : state === 'draft' ? 'Draft' : 'Missing'}
        </span>
      </header>

      {!r && <p className="muted small rc-empty">No report written for this day.</p>}

      {r && (
        <div className="rc-body">
          <Block title="Today's plan" meta={`${planDone}/${plan.length} done`} show={plan.length > 0}>
            <ul className="rc-plan">
              {plan.map((p, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <li key={i} className={p.done ? 'is-done' : ''}><Icon name={p.done ? 'tick' : 'dot'} size={12} /> {p.text}</li>
              ))}
            </ul>
          </Block>

          <Block title="Projects" meta={`${work.length} written`} show={work.length > 0}>
            <ul className="rc-list">
              {work.map((w) => (
                <li key={w.task.id}>
                  <div className="rc-line-head"><span className="strong">{w.task.name}</span>{w.hours ? <span className="muted small">{w.hours} h</span> : null}{w.count ? <span className="muted small">{w.count} tasks</span> : null}{w.amount ? <span className="muted small">≈ {formatAmount(w.amount)}</span> : null}</div>
                  {w.text && <div className="pre-wrap small">{w.text}</div>}
                </li>
              ))}
            </ul>
          </Block>

          <Block title="Calls" meta={`${calls.length} · ${calls.filter((c) => c.result).length} done`} show={calls.length > 0}>
            <ul className="rc-list">
              {calls.map((c, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <li key={i}>
                  <div className="rc-line-head">
                    {c.time && <span className="muted small">{c.time}</span>}
                    <span className="strong">{c.title}</span>
                    {c.result && <span className={`status-badge call-${c.result}`}>{RESULT[c.result]}</span>}
                  </div>
                  {(c.profile || c.caller) && <div className="muted small">{[c.profile && `Profile: ${c.profile}`, c.caller && `Caller: ${c.caller}`].filter(Boolean).join(' · ')}</div>}
                  {c.note && <div className="pre-wrap small">{c.note}</div>}
                </li>
              ))}
            </ul>
          </Block>

          <Block title="Bids">
            <Figures pairs={bids} />
            {r.bidNote && <div className="pre-wrap small muted">{r.bidNote}</div>}
          </Block>

          <Block title="Issues / blockers" show={Boolean(r.issues)}><div className="pre-wrap small rc-issues">{r.issues}</div></Block>
          <Block title="Plan for tomorrow" show={Boolean(r.planTomorrow)}><div className="pre-wrap small">{r.planTomorrow}</div></Block>

          <Block title="Money" show={money.some(([, v]) => v) || Boolean(r.upcomingNote || r.note)}>
            <Figures pairs={money} />
            {r.upcomingDate && <div className="muted small">Expected <DateTag value={r.upcomingDate} utc /></div>}
            {r.upcomingNote && <div className="pre-wrap small muted">{r.upcomingNote}</div>}
            {r.note && <div className="pre-wrap small muted">{r.note}</div>}
          </Block>
        </div>
      )}
    </article>
  );
}

// Member reports for one day, one card each, with the day's totals.
export default function TeamReports({ rows, totals }) {
  if (!rows.length) return null;

  return (
    <section className="team-reports">
      <div className="report-section-head">
        <h3>Member reports</h3>
        <span className="muted small">
          {totals.submitted} of {totals.expected} sent · {formatAmount(totals.jobBid)} applied · {formatAmount(totals.aiBid)} AI bids · {formatAmount(totals.earned)} earned · {formatAmount(totals.upcomingAmount)} upcoming
        </span>
      </div>
      <div className="report-cards">
        {rows.map((row) => <ReportCard key={row.member.id} row={row} />)}
      </div>
    </section>
  );
}
