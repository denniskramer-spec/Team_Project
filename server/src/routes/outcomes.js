import { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import Outcome from '../models/Outcome.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { canRecordOutcome, canManageOutcome, assignableFilter } from '../utils/visibility.js';
import { financeScope, peopleInScope, perGroupSums, perMember, groupList, scopeName, person, who, whoKey } from '../utils/finance.js';
import { resolveTarget, shares, checkMoneyFields, inScope } from '../utils/outcomeTarget.js';
import { imageUpload, describeUpload, checkImages, removeUnusedFiles } from '../utils/uploads.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { checkDay } from '../utils/validate.js';
import { outcomeChanged } from '../socket/events.js';

// Outcome: money going out, per member. A team or group outcome is split
// equally into one record per member. Everyone sees the records in their
// scope (like income); only the team leader and bosses add or change them.
const router = Router();
router.use(requireAuth);

const image = (i) => ({ file: i.file, url: `/api/files/${i.file}`, name: i.name, type: i.type, size: i.size });

// Splits this user sees a share of but cannot change as a whole (they also
// cover groups outside the user's reach).
async function lockedSplits(user, outcomes) {
  const ids = [...new Set(outcomes.filter((o) => o.split?.id).map((o) => String(o.split.id)))];
  if (!ids.length || user.role === 'leader') return new Set();
  const spans = await Outcome.aggregate([
    { $match: { 'split.id': { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } },
    { $group: { _id: '$split.id', groups: { $addToSet: '$group' } } },
  ]);
  return new Set(spans
    .filter((sp) => sp.groups.some((g) => !canManageOutcome(user, { _id: null, group: g })))
    .map((sp) => String(sp._id)));
}

const serialize = (o, user, locked = new Set()) => ({
  id: o._id,
  member: person(o.member),
  group: o.group?._id ? { id: o.group._id, name: o.group.name, slug: o.group.slug } : null,
  who: who(o),
  date: o.date,
  amount: o.amount,
  reason: o.reason,
  comment: o.comment,
  images: (o.images ?? []).map(image),
  split: o.split?.id ? { id: o.split.id, total: o.split.total, count: o.split.count, label: o.split.label } : null,
  createdAt: o.createdAt,
  canEdit: canManageOutcome(user, { _id: o.member?._id ?? o.member, group: o.group?._id ?? o.group })
    && !(o.split?.id && locked.has(String(o.split.id))),
});

async function checkFields(body, partial = false) {
  const fields = checkMoneyFields(body, partial);
  if (!partial || body.date !== undefined) fields.date = checkDay(body.date, 'a date');
  // Every outcome needs proof: at least one image, on create and after an edit.
  const images = await checkImages(body.images);
  if (images !== undefined) fields.images = images;
  if ((!partial || images !== undefined) && !images?.length) throw badRequest('Attach at least one image (a screenshot or receipt)');
  return fields;
}

const item = (o) => ({ id: o._id, date: o.date, amount: o.amount, reason: o.reason, comment: o.comment || '', split: o.split?.id ? o.split.label : null });
const populate = (q) => q.populate('member', 'name role').populate('group', 'name slug');
const stillUsed = (file) => Outcome.exists({ 'images.file': file });

// GET /api/outcomes — same query as /api/incomes (type, period/date or from/to, group, member).
router.get('/', async (req, res) => {
  const { period, filter, allowed, groupId, memberId } = await financeScope(req, 'member');

  const [outcomes, people] = await Promise.all([
    populate(Outcome.find(filter).sort({ date: -1, createdAt: -1 })),
    peopleInScope(req.user, { groupId, memberId }),
  ]);

  const byMember = perMember(outcomes);
  const total = outcomes.reduce((sum, o) => sum + o.amount, 0);

  // One column per person in scope, with the records behind it.
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

  const locked = await lockedSplits(req.user, outcomes);
  res.json({
    period,
    outcomes: outcomes.map((o) => serialize(o, req.user, locked)),
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

// POST /api/outcomes/upload — multipart `images` files; returns the
// references to send back in the record's `images`.
// 30 upload requests (up to 150 images) per 15 minutes per user.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => String(req.user._id),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many uploads, please try again in a few minutes' },
});

router.post('/upload', uploadLimiter, (req, res, next) => {
  if (!canRecordOutcome(req.user)) return next(forbidden('Only the team leader and bosses record outcome'));
  next();
}, imageUpload, (req, res) => {
  res.status(201).json({ images: (req.files ?? []).map(describeUpload) });
});

// One record for a member, or one record per member for a team/group split.
async function createRecords(req, target, fields) {
  if (!target.members) {
    const outcome = await new Outcome({ ...fields, member: target.member, group: target.group, createdBy: req.user._id }).save();
    return [outcome];
  }
  const parts = shares(fields.amount, target.members.length);
  const split = { id: new mongoose.Types.ObjectId(), total: fields.amount, count: target.members.length, label: target.label };
  const docs = target.members.map((m, i) => ({
    ...fields, amount: parts[i], member: m._id, group: m.group ?? null, createdBy: req.user._id, split,
  }));
  return Outcome.insertMany(docs);
}

router.post('/', async (req, res) => {
  const target = await resolveTarget(req);
  const fields = await checkFields(req.body);
  const created = await createRecords(req, target, fields);
  const saved = await populate(Outcome.find({ _id: { $in: created.map((o) => o._id) } }).sort('member'));
  saved.forEach(outcomeChanged);
  res.status(201).json({ outcomes: saved.map((o) => serialize(o, req.user)) });
});

async function findOutcome(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Outcome not found');
  const outcome = await populate(Outcome.findById(req.params.id));
  if (!outcome || !inScope(req.user, outcome)) throw notFound('Outcome not found');
  if (!canManageOutcome(req.user, { _id: outcome.member?._id, group: outcome.group?._id ?? outcome.group })) {
    throw forbidden('You cannot change this outcome record');
  }
  return outcome;
}

// Every record of a split, or just the one record.
const siblings = (outcome) => (outcome.split?.id ? Outcome.find({ 'split.id': outcome.split.id }) : Outcome.find({ _id: outcome._id }));

// A split is changed or deleted as a whole, so the caller must be allowed to
// manage every share — a boss cannot touch a whole-team split that also
// covers other groups.
async function editableSiblings(req, outcome) {
  const all = await siblings(outcome).sort('member');
  if (all.some((s) => !canManageOutcome(req.user, { _id: s.member, group: s.group }))) {
    throw forbidden('This outcome is shared with members you cannot manage');
  }
  return all;
}

// PATCH /api/outcomes/:id — for a split, date, reason, comment and images
// change on every share, and a new amount is the new total, re-split.
// Who a split is for cannot change: delete it and record it again.
router.patch('/:id', async (req, res) => {
  const outcome = await findOutcome(req);
  const fields = await checkFields(req.body, true);
  const before = (outcome.images ?? []).map((i) => i.file);

  if (outcome.split?.id) {
    if (req.body.member !== undefined || req.body.team !== undefined) throw badRequest('A shared outcome cannot be moved; delete it and record it again');
    const all = await editableSiblings(req, outcome);
    const { amount, ...rest } = fields;
    const parts = amount !== undefined ? shares(amount, all.length) : null;
    for (const [i, share] of all.entries()) {
      Object.assign(share, rest);
      if (parts) { share.amount = parts[i]; share.split = { ...share.split.toObject?.() ?? share.split, total: amount }; }
      await share.save();
    }
  } else {
    Object.assign(outcome, fields);
    if (req.body.member !== undefined || req.body.team !== undefined) {
      const target = await resolveTarget(req);
      if (target.members) throw badRequest('To share this outcome over a team, delete it and record it again');
      Object.assign(outcome, target);
    }
    await outcome.save();
  }

  if (fields.images) await removeUnusedFiles(before.filter((f) => !fields.images.some((i) => i.file === f)), stillUsed);
  const saved = await populate(siblings(outcome).sort('member'));
  saved.forEach(outcomeChanged);
  res.json({ outcomes: saved.map((o) => serialize(o, req.user)) });
});

// DELETE /api/outcomes/:id — a split is deleted as a whole.
router.delete('/:id', async (req, res) => {
  const outcome = await findOutcome(req);
  const all = await editableSiblings(req, outcome);
  const files = all.flatMap((o) => (o.images ?? []).map((i) => i.file));
  await Outcome.deleteMany({ _id: { $in: all.map((o) => o._id) } });
  await removeUnusedFiles(files, stillUsed);
  all.forEach(outcomeChanged);
  res.json({ ok: true, removed: all.length });
});

export default router;
