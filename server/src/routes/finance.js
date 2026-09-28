import { Router } from 'express';
import Income from '../models/Income.js';
import Outcome from '../models/Outcome.js';
import { requireAuth } from '../middleware/auth.js';
import {
  financeScope, peopleInScope, perGroupSums, groupList, groupTiles, scopeName, person, who, whoKey,
  ownerId, PERSON_FIELDS, LIST_LIMIT,
} from '../utils/finance.js';

// Total: income and outcome side by side for one period, and the history
// behind them, grouped on the client by person or by date.
const router = Router();
router.use(requireAuth);

const sum = (rows) => rows.reduce((acc, r) => acc + r.amount, 0);

// GET /api/finance/total — same query as /api/incomes.
router.get('/total', async (req, res) => {
  const { period, filter, allowed, groupId, memberId } = await financeScope(req, 'member');

  const [incomes, outcomes] = await Promise.all([
    Income.find(filter).populate('member', PERSON_FIELDS).populate('task', 'name').lean(),
    Outcome.find(filter).populate('member', PERSON_FIELDS).populate('group', 'name slug').lean(),
  ]);
  const people = await peopleInScope(req.user, { groupId, memberId }, [...incomes, ...outcomes].map((r) => ownerId(r, 'member')));

  const income = sum(incomes);
  const outcome = sum(outcomes);

  // One column per person. Team costs (no member) count in the totals and
  // the history, not in the chart.
  const chart = people.map((p) => {
    const id = String(p._id);
    const inn = sum(incomes.filter((i) => whoKey(i) === id));
    const out = sum(outcomes.filter((o) => whoKey(o) === id));
    return { member: person(p), income: inn, outcome: out, net: inn - out };
  });

  // Every record in one list, newest first; `label` is what the row is about.
  const history = [
    ...incomes.map((i) => ({
      kind: 'income', id: i._id, date: i.date, member: who(i), amount: i.amount,
      label: i.from, note: i.note || '', task: i.task?._id ? { id: i.task._id, name: i.task.name } : null, createdAt: i.createdAt,
    })),
    ...outcomes.map((o) => ({
      kind: 'outcome', id: o._id, date: o.date, member: who(o), amount: o.amount,
      label: o.reason, note: o.comment || '', task: null, createdAt: o.createdAt,
    })),
  ].sort((a, b) => (b.date - a.date) || (b.createdAt - a.createdAt));

  const [incomeSums, outcomeSums] = await Promise.all([
    perGroupSums(Income, req.user, allowed, period),
    perGroupSums(Outcome, req.user, allowed, period),
  ]);
  const perGroup = groupTiles(allowed, (k) => incomeSums.has(k) || outcomeSums.has(k), (k) => {
    const inn = incomeSums.get(k)?.amount ?? 0;
    const out = outcomeSums.get(k)?.amount ?? 0;
    return { income: inn, outcome: out, net: inn - out };
  });

  res.json({
    period,
    income,
    outcome,
    net: income - outcome,
    counts: { income: incomes.length, outcome: outcomes.length },
    chart,
    // The newest records; `counts` says how many there are in all.
    history: history.slice(0, LIST_LIMIT * 2),
    perGroup,
    groups: groupList(allowed),
    scope: scopeName(req.user),
  });
});

export default router;
