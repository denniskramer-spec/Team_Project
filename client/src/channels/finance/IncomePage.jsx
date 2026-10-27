import { useState } from 'react';
import { formatAmount, nameOf, shownOf } from '../../format.js';
import DateTag from '../../components/DateTag.jsx';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import IncomeChart from './IncomeChart.jsx';
import FinanceToolbar from './FinanceToolbar.jsx';
import { useFinancePeriod, scopeLabel } from './useFinancePeriod.js';
import { useLiveData } from '../../useLiveData.js';
import IncomeForm from './IncomeForm.jsx';
import { useCurrency } from './useCurrency.js';
import RateNote from './RateNote.jsx';
import Modal from '../../components/Modal.jsx';

// The chart rows in the chosen currency: every amount in them is converted.
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
export default function IncomePage() {
  const period = useFinancePeriod();
  const currency = useCurrency();
  const { money, convert } = currency;
  // Upcoming income comes from the daily reports, so they refresh the chart too.
  const { data, error, reload } = useLiveData(`/incomes?${period.query}`, ['income:changed', 'report:changed']);
  const [lightbox, setLightbox] = useState(null);
  const [recording, setRecording] = useState(false);

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page muted">Loading...</div>;
  const p = data.period;
  const top = data.perMember[0]?.amount ?? 0;

  return (
    <div className="page finance-page">
      <FinanceToolbar
        period={p}
        type={period.type} from={period.from} to={period.to}
        onType={period.setType} onRange={period.setRange}
        scope={scopeLabel(data, period, data.chart[0]?.member?.name, 'income')}
        currency={currency}
        actions={data.can.record && (
          <button className="btn primary finance-add" onClick={() => setRecording(true)}>
            <Icon name="plus" size={16} /> Record income
          </button>
        )}
      />

      <RateNote currency={currency} />
      <div className="stat-row finance-stats">
        <div className="stat stat-good">
          <span className="stat-value">{money(data.total)}</span>
          <span className="muted small">Total income · {p.label}</span>
        </div>
        {/* One tile per group this role can see, so the groups sit side by side. */}
        {data.perGroup?.map((g) => (
          <div key={g.id} className={`stat role-border-boss${period.group === g.slug ? ' is-selected' : ''}`}>
            <span className="stat-value">{money(g.amount)}</span>
            <span className="muted small">{g.name} · {g.count} {g.count === 1 ? 'record' : 'records'}</span>
          </div>
        ))}
        <div className="stat role-border-member">
          <span className="stat-value">{money(data.net)}</span>
          <span className="muted small">Net · after {money(data.fees)} fees and {money(data.residents)} to residents</span>
        </div>
      </div>

      {data.chart?.length > 0 && <IncomeChart rows={convertRows(data.chart, convert)} periodLabel={`${p.label} · ${currency.code}`} />}

      {data.perMember.length > 1 && (
        <section className="card">
          <div className="report-section-head"><h3>Income per member</h3></div>
          <ul className="bar-list">
            {data.perMember.map((row) => (
              <li key={row.member?.id ?? 'unknown'}>
                <span className="bar-label">{nameOf(row.member)}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${top ? (row.amount / top) * 100 : 0}%` }} />
                </span>
                <span className="bar-value">{money(row.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!data.incomes.length && (
        <div className="empty-inline muted"><Icon name="coins" size={20} /> No income recorded for {p.label}.</div>
      )}

      {data.incomes.length > 0 && (
        <section className="card">
          <div className="report-section-head"><h3>Income records</h3></div>
          {shownOf(data.incomes.length, data.count) && <p className="muted small list-note">{shownOf(data.incomes.length, data.count)}</p>}
          <table className="table finance-table">
            <thead>
              <tr><th>Date</th><th>Member</th><th>Project · resident</th><th className="num">Amount</th></tr>
            </thead>
            <tbody>
              {data.incomes.map((i) => (
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
                    {i.images?.length > 0 && (
                      <ul className="image-thumbs small-thumbs" aria-label="Screenshots">
                        {i.images.map((img, n) => (
                          <li key={img.file}>
                            <button type="button" className="thumb-open" onClick={() => setLightbox({ images: i.images, index: n, title: i.from })}>
                              <img src={img.url} alt={img.name} title={img.name} loading="lazy" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
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

      {recording && (
        <IncomeForm
          forSelf={data.can.recordForSelf}
          forOthers={data.can.recordForOthers}
          onClose={() => setRecording(false)}
          onSaved={() => { setRecording(false); reload(); }}
        />
      )}
      {lightbox && (
        <Modal title={`${lightbox.title} · ${lightbox.index + 1} / ${lightbox.images.length}`} onClose={() => setLightbox(null)} width={900}>
          <div className="lightbox">
            <img src={lightbox.images[lightbox.index].url} alt={lightbox.images[lightbox.index].name} />
            {lightbox.images.length > 1 && (
              <div className="lightbox-nav">
                <button className="btn" onClick={() => setLightbox({ ...lightbox, index: (lightbox.index + lightbox.images.length - 1) % lightbox.images.length })}>Previous</button>
                <span className="muted small">{lightbox.images[lightbox.index].name}</span>
                <button className="btn" onClick={() => setLightbox({ ...lightbox, index: (lightbox.index + 1) % lightbox.images.length })}>Next</button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
