import { useState } from 'react';
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

// The chart rows in the chosen currency: every amount in them is converted
// (the server already turns upcoming work priced in another currency into
// the base one).
const convertRows = (rows, convert) => rows.map((r) => ({
  ...r,
  planned: convert(r.planned), actual: convert(r.actual), upcoming: convert(r.upcoming),
  incomeItems: (r.incomeItems ?? []).map((i) => ({ ...i, amount: convert(i.amount) })),
  upcomingItems: (r.upcomingItems ?? []).map((u) => ({ ...u, amount: convert(u.amount) })),
}));

// Income for one period, for All or one group: totals, the planned vs real
// chart, income per member and the records. Members record their own income,
// bosses and the leader for the people they manage. Records are history: once
// recorded they cannot be edited or deleted.
const EMPTY = [];
const COLUMNS = {
  date: { by: (i) => i.date, desc: true },
  member: (i) => nameOf(i.member, ''),
  project: (i) => i.task?.name ?? i.from ?? null,
  amount: { by: (i) => i.amount, desc: true },
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

function IncomeBody({ data, group, currency, sorter, onImages }) {
  const { money, convert } = currency;
  const p = data.period;
  return (
    <>
      <div className="stat-row finance-stats">
        <div className="stat stat-good">
          <span className="stat-value">{money(data.total)}</span>
          <span className="muted small">Total income · {p.label}</span>
        </div>
        <GroupTiles
          tiles={data.perGroup} selected={group}
          value={(g) => money(g.amount)}
          caption={(g) => `${g.name} · ${g.count} ${g.count === 1 ? 'record' : 'records'}`}
        />
        <div className="stat role-border-member">
          <span className="stat-value">{money(data.net)}</span>
          <span className="muted small">Net · after {money(data.fees)} fees and {money(data.residents)} to residents</span>
        </div>
      </div>

      {data.chart?.length > 0 && <IncomeChart rows={convertRows(data.chart, convert)} periodLabel={`${p.label} · ${currency.code}`} />}

      <MemberBars title="Income per member" rows={data.perMember} money={money} />

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
                <Th sort={sorter} col="amount" className="num">Amount</Th>
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
                    <ImageThumbs images={i.images} label="Screenshots" onOpen={(index) => onImages({ images: i.images, index, title: i.task?.name ?? i.from ?? 'Income' })} />
                  </td>
                  <td data-label="Amount" className="num">
                    <div className="strong">{money(i.amount)}</div>
                    {i.currency && i.currency !== currency.base && (
                      <div className="muted small" title={`1 ${currency.base} = ${i.rate} ${i.currency}${i.rateDate ? ` · rate of ${i.rateDate}` : ''}`}>
                        received {i.currency} {formatAmount(i.originalAmount)}
                      </div>
                    )}
                    <div className="muted small split-line">
                      {i.methodLabel}{i.feeAmount ? ` · fee ${money(i.feeAmount)}` : ''}
                      {i.resident ? ` · ${i.resident.name} ${money(i.residentAmount)}` : ''}
                      {(i.feeAmount || i.residentAmount) ? ` · net ${money(i.net)}` : ''}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td className="strong">Total</td><td colSpan={2} /><td className="num strong">{money(data.total)}</td></tr>
            </tfoot>
          </table>
        </section>
      )}
    </>
  );
}
