import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useSocketEvent } from '../../socket/SocketContext.jsx';
import { useToast } from '../../components/Toast.jsx';
import { formatAmount, formatDay } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import Dropdown from '../../components/Dropdown.jsx';
import { ConfirmDialog } from '../../components/Modal.jsx';
import OutcomeForm from './OutcomeForm.jsx';
import FinanceColumns from './FinanceColumns.jsx';
import FinanceToolbar from './FinanceToolbar.jsx';
import { useFinancePeriod, scopeLabel } from './useFinancePeriod.js';

const SERIES = [{ key: 'outcome', label: 'Outcome', color: 'var(--series-2)' }];
// More items than this and the hover card only summarises; a click opens the full list.
const TOOLTIP_LIMIT = 8;

// Who spent the most and the least this period. Everyone tied is tagged;
// nothing is tagged with one person or when everyone is equal, and people
// with nothing recorded are not "Lowest" — that would tag half the chart.
function rankTag(row, rows) {
  const amounts = rows.map((r) => r.values.outcome);
  const best = Math.max(...amounts);
  const worst = Math.min(...amounts);
  if (rows.length < 2 || best === worst) return null;
  if (row.values.outcome === best) return { text: '▲ Highest', cls: 'top', color: 'var(--series-2)' };
  if (worst > 0 && row.values.outcome === worst) return { text: '▼ Lowest', cls: 'low', color: 'var(--status-neutral)' };
  return null;
}

function ItemsTable({ items }) {
  return (
    <table className="table">
      <thead><tr><th>Date</th><th>Reason</th><th className="num">Amount</th></tr></thead>
      <tbody>
        {items.map((o) => (
          <tr key={o.id}>
            <td>{formatDay(o.date)}</td>
            <td>{o.reason}{o.comment && <div className="muted small">{o.comment}</div>}</td>
            <td className="num strong">{formatAmount(o.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Outcome for one period: the same layout as Income, with a Record button
// for the team leader and bosses.
export default function OutcomePage() {
  const toast = useToast();
  const period = useFinancePeriod();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`/outcomes?${period.query}`));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [period.query]);

  useEffect(() => { load(); }, [load]);
  useSocketEvent('outcome:changed', load);

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/outcomes/${confirm.id}`, { method: 'DELETE' });
      toast('Outcome deleted');
      setConfirm(null);
      load();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page muted">Loading...</div>;
  const p = data.period;
  const top = data.perMember[0]?.amount ?? 0;
  const rows = data.chart.map((c) => ({ id: c.member.id, name: c.member.name, values: { outcome: c.amount }, items: c.items }));

  return (
    <div className="page finance-page">
      <FinanceToolbar
        period={p}
        type={period.type} from={period.from} to={period.to}
        onType={period.setType} onRange={period.setRange}
        scope={scopeLabel(data, period, data.chart[0]?.member?.name, 'outcome')}
        actions={data.can.record && (
          <button className="btn primary finance-add" onClick={() => setForm({})}>
            <Icon name="plus" size={16} /> Record outcome
          </button>
        )}
      />

      <div className="stat-row finance-stats">
        <div className="stat stat-bad">
          <span className="stat-value">{formatAmount(data.total)}</span>
          <span className="muted small">Total outcome · {p.label}</span>
        </div>
        {data.perGroup?.map((g) => (
          <div key={g.id} className={`stat role-border-boss${period.group === g.slug ? ' is-selected' : ''}`}>
            <span className="stat-value">{formatAmount(g.amount)}</span>
            <span className="muted small">{g.name} · {g.count} {g.count === 1 ? 'record' : 'records'}</span>
          </div>
        ))}
        <div className="stat role-border-member">
          <span className="stat-value">{data.outcomes.length}</span>
          <span className="muted small">{data.outcomes.length === 1 ? 'Record' : 'Records'}</span>
        </div>
      </div>

      {rows.length > 0 && (
        <FinanceColumns
          title="Outcome per member"
          periodLabel={p.label}
          rows={rows}
          series={SERIES}
          tag={rankTag}
          emptyNote={`No outcome recorded for ${p.label}.`}
          tooltip={(row) => {
            if (!row.items.length) return null;
            if (row.items.length > TOOLTIP_LIMIT) return <span className="tooltip-hint">{row.items.length} records · click for details</span>;
            return (
              <>
                <ul className="tooltip-detail">
                  {row.items.map((o) => (
                    <li key={o.id}>
                      <span className="tooltip-name">{formatDay(o.date)} · {o.reason}</span>
                      <span className="tooltip-value">{formatAmount(o.amount)}</span>
                    </li>
                  ))}
                </ul>
                <span className="tooltip-hint">click for details</span>
              </>
            );
          }}
          detail={(row) => (
            <div className="income-detail">
              <div className="stat-row">
                <div className="stat stat-bad">
                  <span className="stat-value">{formatAmount(row.values.outcome)}</span>
                  <span className="muted small">Outcome · {row.items.length} {row.items.length === 1 ? 'record' : 'records'}</span>
                </div>
              </div>
              {row.items.length ? <ItemsTable items={row.items} /> : <p className="muted small">No outcome recorded.</p>}
            </div>
          )}
        />
      )}

      {data.perMember.length > 1 && (
        <section className="card">
          <div className="report-section-head"><h3>Outcome per member</h3></div>
          <ul className="bar-list">
            {data.perMember.map((row) => (
              <li key={row.member?.id ?? 'unknown'}>
                <span className="bar-label">{row.member?.name ?? 'Unknown'}</span>
                <span className="bar-track">
                  <span className="bar-fill out" style={{ width: `${top ? (row.amount / top) * 100 : 0}%` }} />
                </span>
                <span className="bar-value">{formatAmount(row.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!data.outcomes.length && (
        <div className="empty-inline muted"><Icon name="coins" size={20} /> No outcome recorded for {p.label}.</div>
      )}

      {data.outcomes.length > 0 && (
        <section className="card">
          <div className="report-section-head"><h3>Outcome records</h3></div>
          <table className="table finance-table">
            <thead>
              <tr><th>Date</th><th>For</th><th>Reason</th><th className="num">Amount</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {data.outcomes.map((o) => (
                <tr key={o.id}>
                  <td data-label="Date">{formatDay(o.date)}</td>
                  <td data-label="For">
                    <div className="cell-user">
                      <Avatar name={o.who.name} role={o.who.role} size={26} />
                      <span>{o.who.name}</span>
                    </div>
                  </td>
                  <td data-label="Reason">
                    {o.reason}
                    {o.comment && <div className="muted small">{o.comment}</div>}
                  </td>
                  <td data-label="Amount" className="num strong">{formatAmount(o.amount)}</td>
                  <td className="cell-actions">
                    {o.canEdit && (
                      <Dropdown
                        label="Outcome actions"
                        items={[
                          { label: 'Edit', icon: 'edit', onClick: () => setForm(o) },
                          { label: 'Delete', icon: 'trash', danger: true, onClick: () => setConfirm(o) },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td className="strong">Total</td><td colSpan={2} /><td className="num strong">{formatAmount(data.total)}</td><td /></tr>
            </tfoot>
          </table>
        </section>
      )}

      {form && (
        <OutcomeForm
          outcome={form.id ? form : null}
          groups={data.groups}
          wholeTeam={data.can.wholeTeam}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); load(); }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title="Delete this outcome record?"
          message={`${formatAmount(confirm.amount)} for ${confirm.reason} on ${formatDay(confirm.date)} will be removed.`}
          confirmLabel="Delete"
          danger
          busy={busy}
          onConfirm={remove}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
