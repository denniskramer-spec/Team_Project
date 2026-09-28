import { Router } from 'express';
import mongoose from 'mongoose';
import Instruction from '../models/Instruction.js';
import Group from '../models/Group.js';
import User from '../models/User.js';
import { requireAuth, requireCapability } from '../middleware/auth.js';
import { visibleGroups } from '../utils/scope.js';
import {
  canSendTo, canModify, canView, canSeeReceipts, audienceFilter, unreadFilter, isRecipient,
} from '../utils/instructionPolicy.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { instructionEvent, navChangedFor } from '../socket/events.js';

const router = Router();
router.use(requireAuth);

const PAGE_SIZE = 30;
const AUTHOR_FIELDS = 'name role username';

// The member a direct instruction is for, if the caller may address them.
async function resolveRecipient(req, id) {
  if (!mongoose.isValidObjectId(id)) throw notFound('Member not found');
  const member = await User.findById(id).populate('group', 'name slug');
  if (!member || member.status !== 'active') throw notFound('Member not found');
  const allowed = ['leader', 'admin'].includes(req.user.role)
    || (req.user.role === 'boss' && String(member.group?._id ?? member.group) === String(req.user.group))
    || String(member._id) === String(req.user._id);
  if (!allowed) throw notFound('Member not found');
  return member;
}

function checkBody(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.content !== undefined) {
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) throw badRequest('Write the instruction first');
    if (content.length > 5000) throw badRequest('Instructions can be at most 5000 characters');
    out.content = content;
  }
  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (title.length > 120) throw badRequest('Subject can be at most 120 characters');
    out.title = title;
  }
  if (body.priority !== undefined) {
    if (!['normal', 'urgent'].includes(body.priority)) throw badRequest('Priority must be normal or urgent');
    out.priority = body.priority;
  }
  return out;
}

// Loads active users once so recipient counts don't need a query per instruction.
async function audienceIndex() {
  const users = await User.find({ status: 'active' }, 'group createdAt').lean();
  return (instr) => {
    if (instr.target === 'member') return 1;
    return users.filter((u) => String(u._id) !== String(instr.author._id ?? instr.author)
      && u.createdAt <= instr.createdAt
      && (instr.target === 'all' || String(u.group) === String(instr.group?._id ?? instr.group))).length;
  };
}

function serialize(instr, user, countRecipients) {
  const readByMe = instr.readBy.find((r) => String(r.user) === String(user._id));
  const receipts = canSeeReceipts(user, instr);
  return {
    id: instr._id,
    target: instr.target,
    group: instr.group?._id ? { id: instr.group._id, name: instr.group.name, slug: instr.group.slug } : null,
    recipient: instr.recipient?._id
      ? { id: instr.recipient._id, name: instr.recipient.name, role: instr.recipient.role }
      : null,
    titleKey: instr.target === 'group' ? instr.group?.slug : 'all',
    author: instr.author?._id
      ? { id: instr.author._id, name: instr.author.name, role: instr.author.role, username: instr.author.username }
      : null,
    title: instr.title,
    content: instr.content,
    priority: instr.priority,
    createdAt: instr.createdAt,
    editedAt: instr.editedAt,
    isRecipient: isRecipient(user, instr),
    readAt: readByMe?.at ?? null,
    canModify: canModify(user, instr),
    receipts: receipts ? { read: instr.readBy.length, total: countRecipients(instr) } : null,
  };
}

// Short version sent over the socket to everyone who can see the instruction.
function socketPayload(instr) {
  return {
    id: instr._id,
    target: instr.target,
    groupId: instr.group?._id ?? instr.group ?? null,
    titleKey: instr.target === 'group' ? instr.group?.slug : 'all',
    groupName: instr.group?.name ?? null,
    recipientId: instr.recipient?._id ?? instr.recipient ?? null,
    recipientName: instr.recipient?.name ?? null,
    author: { id: instr.author._id, name: instr.author.name, role: instr.author.role },
    title: instr.title,
    preview: instr.content.slice(0, 200),
    priority: instr.priority,
    createdAt: instr.createdAt,
  };
}

async function findVisible(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Instruction not found');
  const instr = await Instruction.findById(req.params.id)
    .populate('author', AUTHOR_FIELDS)
    .populate('group', 'name slug')
    .populate('recipient', 'name role');
  if (!instr || !canView(req.user, instr)) throw notFound('Instruction not found');
  return instr;
}

// GET /api/instructions?title=all|<group slug>&before=<ISO date>
router.get('/', async (req, res) => {
  const key = req.query.title || 'all';
  const filter = {};
  if (req.query.member) {
    // Instructions sent to one person, from the member level of the tree.
    // A direct instruction is private: only the recipient, its author, and the
    // leader and admins may read it. So a boss looking at one of their members
    // sees the instructions they sent themselves, not the leader's.
    const member = await resolveRecipient(req, req.query.member);
    filter.target = 'member';
    filter.recipient = member._id;
    const isRecipientThemselves = String(member._id) === String(req.user._id);
    if (!['leader', 'admin'].includes(req.user.role) && !isRecipientThemselves) {
      filter.author = req.user._id;
    }
  } else if (key === 'all') {
    // "All" holds instructions for everyone, plus any sent directly to you.
    filter.$or = [{ target: 'all' }, { target: 'member', recipient: req.user._id }];
  } else {
    const groups = await Group.find({}, 'name slug').lean();
    const group = visibleGroups(req.user, groups).find((g) => g.slug === key);
    if (!group) throw notFound('Group not found');
    filter.target = 'group';
    filter.group = group._id;
  }
  if (req.query.before) {
    const before = new Date(req.query.before);
    if (Number.isNaN(before.getTime())) throw badRequest('Invalid "before" date');
    filter.createdAt = { $lt: before };
  }

  const [items, count] = await Promise.all([
    Instruction.find(filter)
      .sort({ createdAt: -1 })
      .limit(PAGE_SIZE + 1)
      .populate('author', AUTHOR_FIELDS)
      .populate('group', 'name slug')
      .populate('recipient', 'name role'),
    audienceIndex(),
  ]);
  res.json({
    instructions: items.slice(0, PAGE_SIZE).map((i) => serialize(i, req.user, count)),
    hasMore: items.length > PAGE_SIZE,
  });
});

// GET /api/instructions/unread — for the alerts panel and header bell.
router.get('/unread', async (req, res) => {
  const filter = unreadFilter(req.user);
  const [items, total] = await Promise.all([
    Instruction.find(filter).sort({ createdAt: -1 }).limit(50)
      .populate('author', AUTHOR_FIELDS).populate('group', 'name slug').populate('recipient', 'name role'),
    Instruction.countDocuments(filter),
  ]);
  res.json({ total, instructions: items.map(socketPayload) });
});

// POST /api/instructions { target, group?, title?, content, priority? }
router.post('/', requireCapability('sendInstructions'), async (req, res) => {
  const fields = checkBody(req.body);
  const target = req.body.target;
  if (!['all', 'group', 'member'].includes(target)) throw badRequest('Target must be "all", "group" or "member"');

  let group = null;
  let recipient = null;
  if (target === 'group') {
    if (!mongoose.isValidObjectId(req.body.group)) throw badRequest('Choose a group');
    group = await Group.findById(req.body.group);
    if (!group) throw badRequest('Unknown group');
  }
  if (target === 'member') {
    if (!req.body.recipient) throw badRequest('Choose a member');
    recipient = await resolveRecipient(req, req.body.recipient);
    if (String(recipient._id) === String(req.user._id)) throw badRequest('You cannot send an instruction to yourself');
  }
  if (!canSendTo(req.user, target, group?._id, recipient)) {
    throw forbidden(req.user.role === 'boss'
      ? 'Bosses can only send instructions inside their own group'
      : 'You cannot send instructions');
  }

  const instr = await new Instruction({
    ...fields,
    target,
    group: group?._id ?? recipient?.group?._id ?? recipient?.group ?? null,
    recipient: recipient?._id ?? null,
    author: req.user._id,
  }).save();
  await instr.populate('author', AUTHOR_FIELDS);
  await instr.populate('group', 'name slug');
  await instr.populate('recipient', 'name role');

  instructionEvent('instruction:new', instr, socketPayload(instr));
  res.status(201).json({ instruction: serialize(instr, req.user, await audienceIndex()) });
});

router.patch('/:id', async (req, res) => {
  const instr = await findVisible(req);
  if (!canModify(req.user, instr)) throw forbidden('You cannot edit this instruction');
  Object.assign(instr, checkBody(req.body, { partial: true }), { editedAt: new Date() });
  await instr.save();
  instructionEvent('instruction:changed', instr, { id: instr._id });
  res.json({ instruction: serialize(instr, req.user, await audienceIndex()) });
});

router.delete('/:id', async (req, res) => {
  const instr = await findVisible(req);
  if (!canModify(req.user, instr)) throw forbidden('You cannot delete this instruction');
  await instr.deleteOne();
  instructionEvent('instruction:deleted', instr, { id: instr._id });
  res.json({ ok: true });
});

// POST /api/instructions/:id/read — the recipient acknowledges it.
router.post('/:id/read', async (req, res) => {
  const instr = await findVisible(req);
  if (!isRecipient(req.user, instr)) throw badRequest('This instruction was not sent to you');
  const updated = await Instruction.findOneAndUpdate(
    { _id: instr._id, 'readBy.user': { $ne: req.user._id } },
    { $push: { readBy: { user: req.user._id, at: new Date() } } },
    { new: true },
  );
  if (updated) {
    instructionEvent('instruction:changed', instr, { id: instr._id });
    navChangedFor(req.user._id);
  }
  res.json({ ok: true });
});

// POST /api/instructions/read-all { title? } — acknowledge everything (optionally one title).
router.post('/read-all', async (req, res) => {
  const filter = unreadFilter(req.user);
  // "All" also lists the instructions sent directly to this user.
  if (req.body?.title === 'all') filter.$or = [{ target: 'all' }, { target: 'member', recipient: req.user._id }];
  else if (req.body?.title) filter.$or = [{ target: 'group', group: req.user.group }];
  const result = await Instruction.updateMany(filter, { $push: { readBy: { user: req.user._id, at: new Date() } } });
  if (result.modifiedCount) navChangedFor(req.user._id);
  res.json({ marked: result.modifiedCount });
});

// GET /api/instructions/:id/reads — who has and hasn't acknowledged (author, leader, admin).
router.get('/:id/reads', async (req, res) => {
  const instr = await findVisible(req);
  if (!canSeeReceipts(req.user, instr)) throw forbidden();
  const recipients = await User.find(audienceFilter(instr), 'name role group')
    .populate('group', 'name').sort('name').lean();
  const readAt = new Map(instr.readBy.map((r) => [String(r.user), r.at]));
  res.json({
    recipients: recipients.map((u) => ({
      id: u._id, name: u.name, role: u.role, group: u.group?.name ?? null, readAt: readAt.get(String(u._id)) ?? null,
    })),
  });
});

export default router;
