import { Router } from 'express';
import mongoose from 'mongoose';
import Outcome from '../models/Outcome.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { canRecordOutcome, canManageOutcome, assignableFilter } from '../utils/visibility.js';
import { financeScope, peopleInScope, perGroupSums, perMember, groupList, scopeName, person, who, whoKey } from '../utils/finance.js';
import { resolveTarget, checkMoneyFields, inScope } from '../utils/outcomeTarget.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { outcomeChanged } from '../socket/events.js';

// Outcome: money going out, per member or as a team cost. Everyone sees the
// records in their scope (like income); only the team leader and bosses may
// add or change them.
const router = Router();
router.use(requireAuth);

const serialize = (o, user) => ({
  id: o._id,
  member: person(o.member),
  group: o.group?._id ? { id: o.group._id, name: o.group.name, slug: o.group.slug } : null,
  who: who(o),
  date: o.date,
  amount: o.amount,
  reason: o.reason,
  comment: o.comment,
  createdAt: o.createdAt,
  canEdit: canManageOutcome(user, { _id: o.member?._id ?? o.member, group: o.group?._id ?? o.group }),
});

function checkFields(body, partial = false) {
  const fields = checkMoneyFields(body, partial);
  if (!partial || body.date !== undefined) {
    const date = new Date(body.date);
    if (!body.date || Number.isNaN(date.getTime())) throw badRequest('Choose a date');
    fields.date = date;
  }
  return fields;
}

const item = (o) => ({ id: o._id, date: o.date, amount: o.amount, reason: o.reason, comment: o.comment || '' });

// GET /api/outcomes — same query as /api/incomes (type, period/date or from/to, group, member).
router.get('/', async (req, res) => {
  const { period, filter, allowed, groupId, memberId } = await financeScope(req, 'member');

  const [outcomes, people] = await Promise.all([
    Outcome.find(filter).sort({ date: -1, createdAt: -1 })
      .populate('member', 'name role').populate('group', 'name slug'),
    peopleInScope(req.user, { groupId, memberId }),
  ]);

  const byMember = perMember(outcomes);
  const total = outcomes.reduce((sum, o) => sum + o.amount, 0);

  // One column per person in scope. Team costs (no member) are in the
  // totals and the table, not in the chart.
  const chart = people.map((p) => {
    const id = String(p._id);
    return {
      member: person(p),
      amount: byMember.get(id)?.amount ?? 0,
      items: outcomes.filter((o) => whoKey(o) === id).map(item),
    };
  });

  const sumFor = await perGroupSums(Outcome, req.user, allowed, period);
  const perGroup = allowed.map((g) => ({
    id: g._id,
    name: g.name,
    slug: g.slug,
    amount: sumFor.get(String(g._id))?.amount ?? 0,
    count: sumFor.get(String(g._id))?.count ?? 0,
  }));

  res.json({
    period,
    outcomes: outcomes.map((o) => serialize(o, req.user)),
    total,
    perMember: [...byMember.values()].sort((a, b) => b.amount - a.amount),
    perGroup,
    chart,
    groups: groupList(allowed),
    can: { record: canRecordOutcome(req.user), wholeTeam: req.user.role === 'leader' },
    scope: scopeName(req.user),
  });
});

// Members this user can record outcome for.
router.get('/members', async (req, res) => {
  if (!canRecordOutcome(req.user)) return res.json({ members: [] });
  const users = await User.find(assignableFilter(req.user), 'name role group')
    .populate('group', 'name').sort('name').lean();
  res.json({ members: users.map((u) => ({ id: u._id, name: u.name, role: u.role, group: u.group?.name ?? null })) });
});

router.post('/', async (req, res) => {
  const target = await resolveTarget(req);
  const outcome = await new Outcome({ ...checkFields(req.body), ...target, createdBy: req.user._id }).save();
  await outcome.populate('member', 'name role');
  await outcome.populate('group', 'name slug');

  outcomeChanged(outcome);
  res.status(201).json({ outcome: serialize(outcome, req.user) });
});

async function findOutcome(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Outcome not found');
  const outcome = await Outcome.findById(req.params.id).populate('member', 'name role').populate('group', 'name slug');
  if (!outcome || !inScope(req.user, outcome)) throw notFound('Outcome not found');
  if (!canManageOutcome(req.user, { _id: outcome.member?._id, group: outcome.group?._id ?? outcome.group })) {
    throw forbidden('You cannot change this outcome record');
  }
  return outcome;
}

router.patch('/:id', async (req, res) => {
  const outcome = await findOutcome(req);
  Object.assign(outcome, checkFields(req.body, true));
  if (req.body.member !== undefined || req.body.team !== undefined) Object.assign(outcome, await resolveTarget(req));
  await outcome.save();
  await outcome.populate('member', 'name role');
  await outcome.populate('group', 'name slug');

  outcomeChanged(outcome);
  res.json({ outcome: serialize(outcome, req.user) });
});

router.delete('/:id', async (req, res) => {
  const outcome = await findOutcome(req);
  await outcome.deleteOne();
  outcomeChanged(outcome);
  res.json({ ok: true });
});

export default router;
