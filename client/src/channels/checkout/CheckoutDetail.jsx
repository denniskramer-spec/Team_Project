import Modal from '../../components/Modal.jsx';
import Avatar from '../../components/Avatar.jsx';
import DateTag from '../../components/DateTag.jsx';
import { formatAmount, nameOf } from '../../format.js';
import { useSort, Th } from '../../components/SortTable.jsx';
import { STATUSES, StatusPill } from '../plan/StatusPicker.jsx';

const PROJECT_STATE = { active: 'Active', paused: 'Paused', done: 'Done' };

const Who = ({ person }) => (
  <div className="cell-user">
    <Avatar name={person?.name ?? '?'} role={person?.role ?? 'member'} size={20} />
    <span>{nameOf(person, '')}</span>
  </div>
);

// One table of records inside the dialog, with a heading, a count and a
// sum, and sortable headers like every other table.
function Records({ title, rows, columns, render, sum, empty }) {
  const sorter = useSort(rows, columns.defs);
  return (
    <section className="detail-block">
      <div className="detail-head">
        <h4>{title}</h4>
        <span className="muted small">{rows.length} {rows.length === 1 ? columns.one : columns.many}{sum !== undefined ? ` · ${formatAmount(sum)}` : ''}</span>
      </div>
      {!rows.length ? <p className="muted small">{empty}</p> : (
        <table className="table detail-table">
          <thead>
            <tr>{columns.heads.map(([key, label, num]) => <Th key={key} sort={sorter} col={key} className={num ? 'num' : ''}>{label}</Th>)}</tr>
          </thead>
          <tbody>{sorter.rows.map(render)}</tbody>
        </table>
      )}
    </section>
  );
}

const plansCols = (key, label) => ({
  one: 'plan', many: 'plans',
  heads: [['member', 'Member'], ['label', 'Plan'], ['value', label, true]],
  defs: { member: (p) => p.member?.name, label: (p) => p.period, value: { by: (p) => p[key], desc: true } },
});
const reportsCols = (key, label) => ({
  one: 'report', many: 'reports',
  heads: [['date', 'Day'], ['member', 'Member'], ['value', label, true]],
  defs: { date: { by: (r) => r.date, desc: true }, member: (r) => r.member?.name, value: { by: (r) => r[key], desc: true } },
});

function PlannedTable({ plans, key_, label }) {
  const rows = plans.filter((p) => p.counted && p[key_] > 0);
  return (
    <Records
      title="Planned" rows={rows} columns={plansCols(key_, label)} sum={rows.reduce((s, p) => s + p[key_], 0)}
      empty="No plan sets a target for this."
      render={(p) => (
        <tr key={p.id}>
          <td data-label="Member"><Who person={p.member} /></td>
          <td data-label="Plan">{p.label}<span className="muted small"> · {p.type}</span></td>
          <td data-label={label} className="num strong">{formatAmount(p[key_])}</td>
        </tr>
      )}
    />
  );
}

function ReportedTable({ reports, key_, label, title = 'Reported' }) {
  return (
    <Records
      title={title} rows={reports} columns={reportsCols(key_, label)} sum={reports.reduce((s, r) => s + r[key_], 0)}
      empty="No daily report in this period."
      render={(r) => (
        <tr key={r.id}>
          <td data-label="Day"><DateTag value={r.date} utc />{!r.sent && <span className="muted small"> · draft</span>}</td>
          <td data-label="Member"><Who person={r.member} /></td>
          <td data-label={label} className="num strong">{formatAmount(r[key_])}</td>
        </tr>
      )}
    />
  );
}

function IncomeDetail({ details }) {
  const earnedCols = {
    one: 'report', many: 'reports',
    heads: [['date', 'Day'], ['member', 'Member'], ['projects', 'Projects'], ['earned', 'Earned', true], ['upcoming', 'Not paid yet', true]],
    defs: { date: { by: (r) => r.date, desc: true }, member: (r) => r.member?.name, projects: (r) => r.projects.join(', '), earned: { by: (r) => r.earned, desc: true }, upcoming: { by: (r) => r.upcoming, desc: true } },
  };
  const incomeCols = {
    one: 'record', many: 'records',
    heads: [['date', 'Date'], ['member', 'Member'], ['from', 'Project · from'], ['amount', 'Amount', true]],
    defs: { date: { by: (i) => i.date, desc: true }, member: (i) => i.member?.name, from: (i) => i.from, amount: { by: (i) => i.amount, desc: true } },
  };
  const reported = details.reports.filter((r) => r.earned > 0 || r.upcoming > 0);
  return (
    <>
      <PlannedTable plans={details.plans} key_="income" label="Income" />
      <Records
        title="Reported" rows={reported} columns={earnedCols} sum={reported.reduce((s, r) => s + r.earned, 0)}
        empty="No daily report earned anything in this period."
        render={(r) => (
          <tr key={r.id}>
            <td data-label="Day"><DateTag value={r.date} utc /></td>
            <td data-label="Member"><Who person={r.member} /></td>
            <td data-label="Projects">{r.projects.join(', ') || <span className="muted">—</span>}</td>
            <td data-label="Earned" className="num strong">{formatAmount(r.earned)}</td>
            <td data-label="Not paid yet" className="num">{r.upcoming > 0 ? <span className="upcoming-amt">{formatAmount(r.upcoming)}</span> : <span className="muted">—</span>}</td>
          </tr>
        )}
      />
      <Records
        title="Received" rows={details.incomes} columns={incomeCols} sum={details.incomes.reduce((s, i) => s + i.amount, 0)}
        empty="No income recorded in Finance for this period."
        render={(i) => (
          <tr key={i.id}>
            <td data-label="Date"><DateTag value={i.date} utc /></td>
            <td data-label="Member"><Who person={i.member} /></td>
            <td data-label="Project · from">{i.from || <span className="muted">—</span>}{i.note && <div className="muted small">{i.note}</div>}</td>
            <td data-label="Amount" className="num strong">{formatAmount(i.amount)}</td>
          </tr>
        )}
      />
    </>
  );
}

function PlansDetail({ details }) {
  const cols = {
    one: 'plan', many: 'plans',
    heads: [['member', 'Member'], ['label', 'Plan'], ['status', 'Status'], ['updated', 'Updated'], ['income', 'Income', true], ['jobBid', 'Job bids', true], ['aiBid', 'AI bids', true]],
    defs: {
      member: (p) => p.member?.name, label: (p) => p.period, status: (p) => STATUSES.findIndex((s) => s.key === p.status),
      updated: { by: (p) => p.statusUpdatedAt, desc: true }, income: { by: (p) => p.income, desc: true }, jobBid: { by: (p) => p.jobBid, desc: true }, aiBid: { by: (p) => p.aiBid, desc: true },
    },
  };
  return (
    <Records
      title="Plans" rows={details.plans} columns={cols} empty="Nobody has a plan for this period."
      render={(p) => (
        <tr key={p.id}>
          <td data-label="Member"><Who person={p.member} /></td>
          <td data-label="Plan">{p.label}<span className="muted small"> · {p.type}</span>{!p.counted && <div className="muted small">covered by the monthly plan</div>}{p.note && <div className="muted small">{p.note}</div>}</td>
          <td data-label="Status"><StatusPill status={p.status} /></td>
          <td data-label="Updated">{p.statusUpdatedAt ? <DateTag value={p.statusUpdatedAt} /> : <span className="muted">—</span>}</td>
          <td data-label="Income" className="num">{formatAmount(p.income)}</td>
          <td data-label="Job bids" className="num">{formatAmount(p.jobBid)}</td>
          <td data-label="AI bids" className="num">{formatAmount(p.aiBid)}</td>
        </tr>
      )}
    />
  );
}

function ProjectsDetail({ details }) {
  const cols = {
    one: 'project', many: 'projects',
    heads: [['name', 'Project'], ['member', 'Member'], ['status', 'Status'], ['source', 'Source'], ['price', 'Price', true], ['start', 'Started'], ['end', 'Ends']],
    defs: {
      name: (t) => t.name, member: (t) => t.member?.name, status: (t) => t.status, source: (t) => t.source,
      price: { by: (t) => t.price, desc: true }, start: { by: (t) => t.startDate, desc: true }, end: { by: (t) => t.endDate, desc: true },
    },
  };
  return (
    <Records
      title="Projects" rows={details.tasks} columns={cols} sum={details.tasks.reduce((s, t) => s + t.price, 0)}
      empty="No project runs in this period."
      render={(t) => (
        <tr key={t.id}>
          <td data-label="Project" className="strong">{t.name}</td>
          <td data-label="Member"><Who person={t.member} /></td>
          <td data-label="Status"><span className={`status-badge project-${t.status}`}>{PROJECT_STATE[t.status] ?? t.status}</span></td>
          <td data-label="Source">{t.source || <span className="muted">—</span>}</td>
          <td data-label="Price" className="num">{t.priceLabel}</td>
          <td data-label="Started"><DateTag value={t.startDate} utc /></td>
          <td data-label="Ends">{t.endDate ? <DateTag value={t.endDate} utc /> : <span className="muted">open-ended</span>}</td>
        </tr>
      )}
    />
  );
}

const KINDS = {
  income: { title: 'Income', body: (d) => <IncomeDetail details={d} /> },
  jobBid: { title: 'Job bids', body: (d) => <><PlannedTable plans={d.plans} key_="jobBid" label="Bids" /><ReportedTable reports={d.reports} key_="jobBid" label="Bids" /></> },
  aiBid: { title: 'AI training bids', body: (d) => <><PlannedTable plans={d.plans} key_="aiBid" label="Bids" /><ReportedTable reports={d.reports} key_="aiBid" label="Bids" /></> },
  plans: { title: 'Plan results', body: (d) => <PlansDetail details={d} /> },
  projects: { title: 'Projects', body: (d) => <ProjectsDetail details={d} /> },
};

// The records behind one Checkout card, in a dialog.
export default function CheckoutDetail({ kind, details, periodLabel, onClose }) {
  const k = KINDS[kind];
  if (!k || !details) return null;
  return (
    <Modal title={`${k.title} · ${periodLabel}`} onClose={onClose} width={860}>
      <div className="detail-blocks">{k.body(details)}</div>
    </Modal>
  );
}
