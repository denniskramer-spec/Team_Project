import { useState } from 'react';
import { formatAmount, formatDay, timeAgo } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';

function Row({ row }) {
  const [open, setOpen] = useState(false);
  const r = row.report;
  const hasText = Boolean(r?.upcomingNote || r?.note || r?.task);

  return (
    <>
      <tr className={r ? '' : 'is-missing'}>
        <td data-label="Member">
          <div className="cell-user">
            <Avatar name={row.member.name} role={row.member.role} size={30} />
            <div>
              <div className={`strong role-text-${row.member.role}`}>{row.member.name}</div>
              <div className="muted small">{row.member.group?.name ?? '—'}</div>
            </div>
          </div>
        </td>
        <td data-label="Job bids" className="num">{r ? formatAmount(r.jobBid) : '—'}</td>
        <td data-label="AI bids" className="num">{r ? formatAmount(r.aiBid) : '—'}</td>
        <td data-label="Income" className="num">{r ? formatAmount(r.income) : '—'}</td>
        <td data-label="Upcoming" className="num">
          {r ? formatAmount(r.upcomingAmount) : '—'}
          {r?.upcomingDate && <div className="muted small">{formatDay(r.upcomingDate)}</div>}
        </td>
        <td data-label="Status">
          {r
            ? <span className="status-pill active" title={`Updated ${timeAgo(r.updatedAt)}`}>submitted</span>
            : <span className="status-pill disabled">missing</span>}
        </td>
        <td className="cell-actions">
          {hasText && (
            <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Details for ${row.member.name}`}>
              <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} />
            </button>
          )}
        </td>
      </tr>
      {open && hasText && (
        <tr className="detail-row">
          <td colSpan={7}>
            {r.task && <p><span className="muted small">Task</span><br />{r.task.name}</p>}
            {r.upcomingNote && <p><span className="muted small">Upcoming note</span><br />{r.upcomingNote}</p>}
            {r.note && <p><span className="muted small">Note</span><br />{r.note}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

// Member reports for one period, with totals. Read-only, as in the guide.
export default function TeamReports({ rows, totals }) {
  if (!rows.length) return null;

  return (
    <section className="card">
      <div className="report-section-head">
        <h3>Member reports</h3>
        <span className="muted small">{totals.submitted} of {totals.expected} submitted</span>
      </div>
      <table className="table report-table">
        <thead>
          <tr>
            <th>Member</th><th className="num">Job bids</th><th className="num">AI bids</th><th className="num">Income</th><th className="num">Upcoming</th><th>Status</th><th aria-label="Details" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => <Row key={row.member.id} row={row} />)}
        </tbody>
        <tfoot>
          <tr>
            <td className="strong">Total</td>
            <td className="num strong">{formatAmount(totals.jobBid)}</td>
            <td className="num strong">{formatAmount(totals.aiBid)}</td>
            <td className="num strong">{formatAmount(totals.income)}</td>
            <td className="num strong">{formatAmount(totals.upcomingAmount)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
