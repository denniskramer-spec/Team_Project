import { useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { formatAmount, formatDay, nameOf, shownOf } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import Dropdown from '../../components/Dropdown.jsx';
import { ConfirmDialog } from '../../components/Modal.jsx';
import Lightbox, { ImageThumbs } from '../../components/Lightbox.jsx';
import { useSort, Th } from '../../components/SortTable.jsx';
import OutcomeForm from './OutcomeForm.jsx';
import FinanceColumns from './FinanceColumns.jsx';
import FinancePage, { GroupTiles, MemberBars } from './FinancePage.jsx';
import { useFinancePage } from './useFinancePage.js';
import { rankOf } from './chartMath.js';
import DateTag from '../../components/DateTag.jsx';
import { TOOLTIP_LIMIT } from './constants.js';

const SERIES = [{ key: 'outcome', label: 'Outcome', color: 'var(--series-2)' }];

// Who spent the most and the least this period (see rankOf: people with
// nothing recorded are never "Lowest").
const RANK_TAGS = {
  top: { text: '▲ Highest', cls: 'top', color: 'var(--series-2)' },
  low: { text: '▼ Lowest', cls: 'low', color: 'var(--status-neutral)' },
};

const EMPTY = [];
const ITEM_COLUMNS = {
  date: { by: (o) => o.date, desc: true },
  reason: (o) => o.reason,
  amount: { by: (o) => o.amount, desc: true },
};
const COLUMNS = {
  ...ITEM_COLUMNS,
  who: (o) => nameOf(o.who),
};

function ItemsTable({ items, money = formatAmount }) {
  const sorter = useSort(items, ITEM_COLUMNS);
  return (
    <table className="table">
      <thead>
        <tr>
          <Th sort={sorter} col="date">Date</Th>
          <Th sort={sorter} col="reason">Reason</Th>
          <Th sort={sorter} col="amount" className="num">Amount</Th>
        </tr>
      </thead>
      <tbody>
        {sorter.rows.map((o) => (
          <tr key={o.id}>
            <td><DateTag value={o.date} utc /></td>
            <td>{o.reason}{o.split && <span className="tag split-tag">{o.split}</span>}{o.comment && <div className="muted small">{o.comment}</div>}</td>
            <td className="num strong">{money(o.amount)}</td>
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
  const page = useFinancePage('/outcomes', ['outcome:changed']);
  const { data, currency } = page;
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const sorter = useSort(data?.outcomes ?? EMPTY, COLUMNS);

  // The page stays mounted between deletes, so `busy` must always come back
  // down; the list itself refreshes through outcome:changed.
  const remove = async () => {
    setBusy(true);
    try {
      const { removed } = await api(`/outcomes/${confirm.id}`, { method: 'DELETE' });
      toast(removed > 1 ? `Shared outcome deleted for ${removed} members` : 'Outcome deleted');
      setConfirm(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FinancePage
      page={page}
      noun="outcome"
      actions={data?.can.record && (
        <button className="btn primary finance-add" onClick={() => setForm({})}>
          <Icon name="plus" size={16} /> Record outcome
        </button>
      )}
      body={(d) => (
        <OutcomeBody
          data={d} group={page.period.group} currency={currency} sorter={sorter}
          onEdit={setForm} onDelete={setConfirm} onImages={setLightbox}
        />
      )}
    >
      {form && data && (
        <OutcomeForm
          outcome={form.id ? form : null}
          groups={data.groups}
          wholeTeam={data.can.wholeTeam}
          onClose={() => setForm(null)}
          onSaved={() => setForm(null)}
        />
      )}
      {lightbox && <Lightbox {...lightbox} onClose={() => setLightbox(null)} />}
      {confirm && (
        <ConfirmDialog
          title={confirm.split ? 'Delete this shared outcome?' : 'Delete this outcome record?'}
          message={confirm.split
            ? `${confirm.reason} on ${formatDay(confirm.date)}: ${formatAmount(confirm.split.total)} shared by ${confirm.split.count} people. All ${confirm.split.count} records will be removed.`
            : `${formatAmount(confirm.amount)} for ${confirm.reason} on ${formatDay(confirm.date)} will be removed.`}
          confirmLabel="Delete"
          danger
          busy={busy}
          onConfirm={remove}
          onClose={() => setConfirm(null)}
        />
      )}
    </FinancePage>
  );
}

function OutcomeBody({ data, group, currency, sorter, onEdit, onDelete, onImages }) {
  const { money } = currency;
  const p = data.period;
  const rows = data.chart.map((c) => ({ id: c.member.id, name: nameOf(c.member), values: { outcome: c.amount }, items: c.items, count: c.count }));
  const rank = rankOf(rows.map((r) => r.values.outcome));

  return (
    <>
      <div className="stat-row finance-stats">
        <div className="stat stat-bad">
          <span className="stat-value">{money(data.total)}</span>
          <span className="muted small">Total outcome · {p.label}</span>
        </div>
        <GroupTiles
          tiles={data.perGroup} selected={group}
          value={(g) => money(g.amount)}
          caption={(g) => `${g.name} · ${g.count} ${g.count === 1 ? 'record' : 'records'}`}
        />
        <div className="stat role-border-member">
          <span className="stat-value">{formatAmount(data.count)}</span>
          <span className="muted small">{data.count === 1 ? 'Record' : 'Records'}</span>
        </div>
      </div>

      {rows.length > 0 && (
        <FinanceColumns
          title="Outcome per member"
          periodLabel={`${p.label} · ${currency.code}`}
          rows={rows}
          series={SERIES}
          tag={(row, all, i) => RANK_TAGS[rank(i)] ?? null}
          emptyNote={`No outcome recorded for ${p.label}.`}
          tooltip={(row) => {
            if (!row.items.length) return null;
            if (row.items.length > TOOLTIP_LIMIT) return <span className="tooltip-hint">{row.count} records · click for details</span>;
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
                  <span className="muted small">Outcome · {row.count} {row.count === 1 ? 'record' : 'records'}</span>
                </div>
              </div>
              {shownOf(row.items.length, row.count) && <p className="muted small list-note">{shownOf(row.items.length, row.count)}</p>}
              {row.items.length ? <ItemsTable items={row.items} /> : <p className="muted small">No outcome recorded.</p>}
            </div>
          )}
        />
      )}

      <MemberBars title="Outcome per member" rows={data.perMember} money={money} out />

      {!data.outcomes.length && (
        <div className="empty-inline muted"><Icon name="coins" size={20} /> No outcome recorded for {p.label}.</div>
      )}

      {data.outcomes.length > 0 && (
        <section className="card">
          <div className="report-section-head"><h3>Outcome records</h3></div>
          {shownOf(data.outcomes.length, data.count) && <p className="muted small list-note">{shownOf(data.outcomes.length, data.count)}</p>}
          <table className="table finance-table">
            <thead>
              <tr>
                <Th sort={sorter} col="date">Date</Th>
                <Th sort={sorter} col="who">For</Th>
                <Th sort={sorter} col="reason">Reason</Th>
                <Th sort={sorter} col="amount" className="num">Amount</Th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {sorter.rows.map((o) => (
                <tr key={o.id}>
                  <td data-label="Date"><DateTag value={o.date} utc /></td>
                  <td data-label="For">
                    <div className="cell-user">
                      <Avatar name={o.who.name} role={o.who.role} size={22} />
                      <span>{nameOf(o.who)}</span>
                    </div>
                  </td>
                  <td data-label="Reason">
                    {o.reason}
                    {o.split && (
                      <span className="tag split-tag" title={`${money(o.split.total)} shared equally by ${o.split.count} people`}>
                        {o.split.label} · 1/{o.split.count} of {money(o.split.total)}
                      </span>
                    )}
                    {o.comment && <div className="muted small">{o.comment}</div>}
                    <ImageThumbs images={o.images} label="Attached images" onOpen={(index) => onImages({ images: o.images, index, title: o.reason })} />
                  </td>
                  <td data-label="Amount" className="num strong">{money(o.amount)}</td>
                  <td className="cell-actions">
                    {o.canEdit && (
                      <Dropdown
                        label="Outcome actions"
                        items={[
                          { label: o.split ? 'Edit shared outcome' : 'Edit', icon: 'edit', onClick: () => onEdit(o) },
                          { label: o.split ? `Delete for all ${o.split.count}` : 'Delete', icon: 'trash', danger: true, onClick: () => onDelete(o) },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td className="strong">Total</td><td colSpan={2} /><td className="num strong">{money(data.total)}</td><td /></tr>
            </tfoot>
          </table>
        </section>
      )}
    </>
  );
}
