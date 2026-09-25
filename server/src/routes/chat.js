import { Router } from 'express';
import mongoose from 'mongoose';
import Message from '../models/Message.js';
import ChatRead from '../models/ChatRead.js';
import Group from '../models/Group.js';
import { requireAuth } from '../middleware/auth.js';
import { visibleGroups } from '../utils/scope.js';
import { resolveChannel, titleKeyFor, canEditMessage, canDeleteMessage } from '../utils/chatPolicy.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { chatEvent, navChangedFor } from '../socket/events.js';

const router = Router();
router.use(requireAuth);

const PAGE_SIZE = 50;
const AUTHOR_FIELDS = 'name role username';

const serialize = (m) => ({
  id: m._id,
  author: m.author?._id
    ? { id: m.author._id, name: m.author.name, role: m.author.role, username: m.author.username }
    : null,
  content: m.content,
  createdAt: m.createdAt,
  editedAt: m.editedAt,
});

function checkContent(value) {
  const content = typeof value === 'string' ? value.trim() : '';
  if (!content) throw badRequest('Write a message first');
  if (content.length > 2000) throw badRequest('Messages can be at most 2000 characters');
  return content;
}

// Unread counts for every chat this user can open (used for nav badges).
export async function chatUnreadCounts(user) {
  const groups = await Group.find({}, 'name slug').lean();
  const channels = [
    { key: 'general', titleKey: 'general' },
    ...visibleGroups(user, groups).map((g) => ({ key: `group:${g._id}`, titleKey: `group-${g.slug}` })),
    { key: 'finance', titleKey: 'finance' },
  ];
  const reads = await ChatRead.find({ user: user._id, channelKey: { $in: channels.map((c) => c.key) } }).lean();
  const readAt = new Map(reads.map((r) => [r.channelKey, r.lastReadAt]));

  const counts = {};
  await Promise.all(channels.map(async (c) => {
    const since = readAt.get(c.key) ?? user.createdAt;
    const count = await Message.countDocuments({
      channelKey: c.key,
      author: { $ne: user._id },
      createdAt: { $gt: since },
    });
    if (count) counts[c.titleKey] = count;
  }));
  return counts;
}

// GET /api/chat/:titleKey/messages?before=<ISO>
router.get('/:titleKey/messages', async (req, res) => {
  const channel = await resolveChannel(req.user, req.params.titleKey);
  const filter = { channelKey: channel.key };
  if (req.query.before) {
    const before = new Date(req.query.before);
    if (Number.isNaN(before.getTime())) throw badRequest('Invalid "before" date');
    filter.createdAt = { $lt: before };
  }

  const found = await Message.find(filter).sort({ createdAt: -1 }).limit(PAGE_SIZE + 1)
    .populate('author', AUTHOR_FIELDS);
  const page = found.slice(0, PAGE_SIZE).reverse(); // oldest first for display
  const read = await ChatRead.findOne({ user: req.user._id, channelKey: channel.key }).lean();

  res.json({
    channel: { titleKey: req.params.titleKey, name: channel.name },
    messages: page.map((m) => serialize(m)),
    hasMore: found.length > PAGE_SIZE,
    lastReadAt: read?.lastReadAt ?? req.user.createdAt,
  });
});

// POST /api/chat/:titleKey/messages { content }
router.post('/:titleKey/messages', async (req, res) => {
  const channel = await resolveChannel(req.user, req.params.titleKey);
  const content = checkContent(req.body.content);

  const message = await new Message({
    channelKey: channel.key,
    group: channel.group?._id ?? null,
    author: req.user._id,
    content,
  }).save();
  await message.populate('author', AUTHOR_FIELDS);

  // Sending counts as having read the chat.
  await ChatRead.findOneAndUpdate(
    { user: req.user._id, channelKey: channel.key },
    { lastReadAt: message.createdAt },
    { upsert: true },
  );

  chatEvent('chat:new', channel, {
    titleKey: titleKeyFor(channel.key, channel.group?.slug),
    channelName: channel.name,
    message: serialize(message),
  });
  res.status(201).json({ message: serialize(message) });
});

async function findMessage(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Message not found');
  const message = await Message.findById(req.params.id).populate('author', AUTHOR_FIELDS);
  if (!message) throw notFound('Message not found');
  // Re-check that the user may open this chat at all.
  const titleKey = message.channelKey.startsWith('group:')
    ? `group-${(await Group.findById(message.group).lean())?.slug}`
    : message.channelKey;
  const channel = await resolveChannel(req.user, titleKey);
  return { message, channel, titleKey };
}

router.patch('/messages/:id', async (req, res) => {
  const { message, channel, titleKey } = await findMessage(req);
  if (!canEditMessage(req.user, message)) throw forbidden('You can only edit your own messages');
  message.content = checkContent(req.body.content);
  message.editedAt = new Date();
  await message.save();

  chatEvent('chat:changed', channel, { titleKey, message: serialize(message) });
  res.json({ message: serialize(message) });
});

router.delete('/messages/:id', async (req, res) => {
  const { message, channel, titleKey } = await findMessage(req);
  if (!canDeleteMessage(req.user, message)) throw forbidden('You cannot delete this message');
  await message.deleteOne();

  chatEvent('chat:deleted', channel, { titleKey, id: message._id });
  res.json({ ok: true });
});

// POST /api/chat/:titleKey/read — everything up to now has been seen.
router.post('/:titleKey/read', async (req, res) => {
  const channel = await resolveChannel(req.user, req.params.titleKey);
  await ChatRead.findOneAndUpdate(
    { user: req.user._id, channelKey: channel.key },
    { lastReadAt: new Date() },
    { upsert: true },
  );
  navChangedFor(req.user._id);
  res.json({ ok: true });
});

router.get('/unread', async (req, res) => {
  res.json({ counts: await chatUnreadCounts(req.user) });
});

export default router;
