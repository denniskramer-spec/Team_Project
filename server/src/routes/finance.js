import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import Income from '../models/Income.js';
import { REAL_INCOME } from '../utils/incomeApproval.js';
import Outcome from '../models/Outcome.js';
import { requireAuth } from '../middleware/auth.js';
import { forbidden } from '../utils/httpError.js';
import { currentRates, refreshRates, refreshIfStale } from '../utils/exchange.js';
import {
  financeScope, peopleInScope, perGroupSums, groupList, groupTiles, scopeName, person, who, whoKeyExpr,
  PERSON_FIELDS, LIST_LIMIT, LIMITS,
} from '../utils/finance.js';

// Total: income and outcome side by side for one period, and the history
// behind them, grouped on the client by person or by date.
const router = Router();
router.use(requireAuth);

const sum = (rows) => Math.round(rows.reduce((acc, r) => acc + r.amount, 0) * 100) / 100;

// GET /api/finance/rates — the day's exchange rates from the base currency,
// for showing the Finance pages in another currency, with the limits the
// Finance pages share with the server (longest duration, list sizes).
router.get('/rates', (req, res) => {
  refreshIfStale();
  res.json({ ...currentRates(), canRefresh: ['admin', 'leader'].includes(req.user.role), limits: LIMITS });
});

// POST /api/finance/rates/refresh — fetch today's rates now (admins, leader).
// Each call asks an outside service, so: twice a minute per person.
const refreshLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 2, keyGenerator: (req) => String(req.user._id), standardHeaders: 'draft-7', legacyHeaders: false,
  message: { message: 'Rates were just refreshed, please wait a minute' },
});
router.post('/rates/refresh', refreshLimiter, async (req, res) => {
  if (!['admin', 'leader'].includes(req.user.role)) throw forbidden('Only admins and the team leader refresh exchange rates');
  await refreshRates();
  req.audit = { action: 'finance.rates.refresh', details: { rateDate: currentRates().rateDate, source: currentRates().source } };
  res.json({ ...currentRates(), canRefresh: true, limits: LIMITS });
});

// GET /api/finance/total — same query as /api/incomes.
router.get('/total', async (req, res) => {
  const { period, filter, allowed, groupId, memberId } = await financeScope(req, 'member');

  // The sums per person come from the database; only the newest records
  // are loaded, for the history, so a long period never loads them all.
  const real = { ...filter, ...REAL_INCOME };
  const newest = { date: -1, createdAt: -1 };
  const sumsBy = (Model, match, key) => Model.aggregate([{ $match: match }, { $group: { _id: key, amount: { $sum: '$amount' }, count: { $sum: 1 } } }])
    .then((rows) => new Map(rows.map((r) => [String(r._id), r])));
  const [incomeBy, outcomeBy, incomes, outcomes] = await Promise.all([
    sumsBy(Income, real, '$member'),
    sumsBy(Outcome, filter, whoKeyExpr),
    Income.find(real).sort(newest).limit(LIST_LIMIT * 2).populate('member', PERSON_FIELDS).populate('task', 'name').lean(),
    Outcome.find(filter).sort(newest).limit(LIST_LIMIT * 2).populate('member', PERSON_FIELDS).populate('group', 'name slug').lean(),
  ]);
  const people = await peopleInScope(req.user, { groupId, memberId }, [...incomeBy.keys(), ...outcomeBy.keys()].filter((k) => !k.startsWith('team:')));

  const income = sum([...incomeBy.values()]);
  const outcome = sum([...outcomeBy.values()]);

  // One column per person. Team costs (no member) count in the totals and
  // the history, not in the chart.
  const chart = people.map((p) => {
    const id = String(p._id);
    const inn = sum([incomeBy.get(id) ?? { amount: 0 }]);
    const out = sum([outcomeBy.get(id) ?? { amount: 0 }]);
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
    perGroupSums(Income, req.user, allowed, period, { where: REAL_INCOME }),
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
    counts: { income: [...incomeBy.values()].reduce((n, r) => n + r.count, 0), outcome: [...outcomeBy.values()].reduce((n, r) => n + r.count, 0) },
    chart,
    // The newest records; `counts` says how many there are in all.
    history: history.slice(0, LIST_LIMIT * 2),
    perGroup,
    groups: groupList(allowed),
    scope: scopeName(req.user),
  });
});

export default router;
