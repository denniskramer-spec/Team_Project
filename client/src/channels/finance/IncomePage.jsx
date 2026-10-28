import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useToast } from '../../components/Toast.jsx';
import { formatAmount, nameOf, shownOf } from '../../format.js';
import DateTag from '../../components/DateTag.jsx';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import Lightbox, { ImageThumbs } from '../../components/Lightbox.jsx';
import { useSort, Th } from '../../components/SortTable.jsx';
import IncomeChart from './IncomeChart.jsx';
import IncomeForm from './IncomeForm.jsx';
import FinancePage, { GroupTiles, MemberBars } from './FinancePage.jsx';
import { useFinancePage } from './useFinancePage.js';

// The chart rows as the page shows them: income is what the member keeps
// (net of the payment fee and the resident's share), set against the plan
// and the upcoming work.
const netRows = (rows) => rows.map((r) => ({
  ...r,
  actual: r.actualNet ?? r.actual,
  incomeItems: (r.incomeItems ?? []).map((i) => ({ ...i, amount: i.net ?? i.amount })),
}));

// Income for one period, for All or one group: totals, the planned vs real
// chart, income per member and the records. Every income figure here is net:
// what is left after the payment fee and the resident's share, in the base
// currency it is recorded in. Members record their own income, bosses and
// the leader for the people they manage. Records are history: once recorded
// they cannot be edited or deleted.
const EMPTY = [];
const COLUMNS = {
  date: { by: (i) => i.date, desc: true },
  member: (i) => nameOf(i.member, ''),
  project: (i) => i.task?.name ?? i.from ?? null,
  amount: { by: (i) => i.net, desc: true },
};

export default function IncomePage() {
  // Upcoming income comes from the daily reports, so they refresh the chart too.
  const page = useFinancePage('/incomes', ['income:changed', 'report:changed']);
  const { data, currency } = page;
  const [lightbox, setLightbox] = useState(null);
  const [recording, setRecording] = useState(false);
  const sorter = useSort(data?.incomes ?? EMPTY, COLUMNS);

  return (
    <FinancePage
      page={page}
      noun="income"
      body={(d) => <IncomeBody data={d} group={page.period.group} currency={currency} sorter={sorter} onImages={setLightbox} />}
      actions={data?.can.record && (
        <button className="btn primary finance-add" onClick={() => setRecording(true)}>
          <Icon name="plus" size={16} /> Record income
        </button>
      )}
    >
      {/* The socket event reaches the recorder too, so saving needs no reload of its own. */}
      {recording && data && (
        <IncomeForm
          forSelf={data.can.recordForSelf}
          forOthers={data.can.recordForOthers}
          onClose={() => setRecording(false)}
          onSaved={() => setRecording(false)}
        />
      )}
      {lightbox && <Lightbox {...lightbox} onClose={() => setLightbox(null)} />}
    </FinancePage>
  );
}

// An income far from what the project's reported work expected: how far,
// the member's reason, and (for the team leader and bosses) a way to check
// it off, which clears it from their Finance badge.
function VarianceNote({ income, money }) {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const v = income.variance;
  const mine = v.checkedBy.some((c) => String(c.id) === String(user.id));
  const canCheck = ['leader', 'boss'].includes(user.role) && !mine;
  const check = async () => {
    setBusy(true);
    try {
      await api(`/incomes/${income.id}/check`, { method: 'POST' });
      toast('Marked as checked');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`variance-note${canCheck ? ' is-open' : ''}`}>
      <span className="strong">{v.percent > 0 ? '▲' : '▼'} {Math.abs(v.percent)}% {v.percent > 0 ? 'above' : 'below'} the expected {money(v.expected)}</span>
      {v.reason && <span className="variance-reason">“{v.reason}”</span>}
      {v.checkedBy.length > 0 && <span className="muted small">checked by {v.checkedBy.map((c) => c.name).join(', ')}</span>}
      {canCheck && <button type="button" className="btn small-btn" onClick={check} disabled={busy}>{busy ? 'Saving...' : 'Mark checked'}</button>}
    </div>
  );
}

function IncomeBody({ data, group, currency, sorter, onImages }) {
  const { money } = currency;
  const p = data.period;
  const perMember = data.perMember.map((m) => ({ ...m, amount: m.net ?? m.amount })).sort((a, b) => b.amount - a.amount);
  return (
    <>
      <div className="stat-row finance-stats">
        <div className="stat stat-good" title={`${money(data.total)} received`}>
          <span className="stat-value">{money(data.net)}</span>
          <span className="muted small">Net income · {p.label} · after {money(data.fees)} fees and {money(data.residents)} to residents</span>
        </div>
        <GroupTiles
          tiles={data.perGroup} selected={group}
          value={(g) => money(g.net ?? g.amount)}
          caption={(g) => `${g.name} · ${g.count} ${g.count === 1 ? 'record' : 'records'}`}
        />
      </div>

      {data.chart?.length > 0 && <IncomeChart rows={netRows(data.chart)} periodLabel={`${p.label} · ${currency.code} · net`} />}

      <MemberBars title="Net income per member" rows={perMember} money={money} />

      {!data.incomes.length && (
        <div className="empty-inline muted"><Icon name="coins" size={20} /> No income recorded for {p.label}.</div>
      )}

      {data.incomes.length > 0 && (
        <section className="card">
          <div className="report-section-head"><h3>Income records</h3></div>
          {shownOf(data.incomes.length, data.count) && <p className="muted small list-note">{shownOf(data.incomes.length, data.count)}</p>}
          <table className="table finance-table">
            <thead>
              <tr>
                <Th sort={sorter} col="date">Date</Th>
                <Th sort={sorter} col="member">Member</Th>
                <Th sort={sorter} col="project">Project · resident</Th>
                <Th sort={sorter} col="amount" className="num">Net</Th>
              </tr>
            </thead>
            <tbody>
              {sorter.rows.map((i) => (
                <tr key={i.id}>
                  <td data-label="Date"><DateTag value={i.date} utc /></td>
                  <td data-label="Member">
                    <div className="cell-user">
                      <Avatar name={i.member?.name ?? '?'} role={i.member?.role ?? 'member'} size={22} />
                      <span>{nameOf(i.member, '')}</span>
                    </div>
                  </td>
                  <td data-label="Project · resident">
                    <div className="strong">{i.task?.name ?? i.from ?? '—'}</div>
                    {i.resident && <div className="muted small">for {i.resident.name}</div>}
                    {i.note && <div className="muted small">{i.note}</div>}
                    {i.variance && <VarianceNote income={i} money={money} />}
                    <ImageThumbs images={i.images} label="Screenshots" onOpen={(index) => onImages({ images: i.images, index, title: i.task?.name ?? i.from ?? 'Income' })} />
                  </td>
                  <td data-label="Net" className="num">
                    <div className="strong">{money(i.net)}</div>
                    {/* How the net came about: what arrived, then the fee and the resident's share. */}
                    <div className="muted small split-line">
                      {(i.feeAmount || i.residentAmount) ? `received ${money(i.amount)} · ` : ''}{i.methodLabel}
                      {i.feeAmount ? ` · fee ${money(i.feeAmount)}` : ''}
                      {i.resident ? ` · ${i.resident.name} ${money(i.residentAmount)}` : ''}
                    </div>
                    {i.currency && i.currency !== currency.base && (
                      <div className="muted small" title={`1 ${currency.base} = ${i.rate} ${i.currency}${i.rateDate ? ` · rate of ${i.rateDate}` : ''}`}>
                        arrived as {i.currency} {formatAmount(i.originalAmount)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td className="strong">Total net</td><td colSpan={2} /><td className="num strong">{money(data.net)}</td></tr>
            </tfoot>
          </table>
        </section>
      )}
    </>
  );
}
