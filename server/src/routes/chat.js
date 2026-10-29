import { Router } from 'express';
import { archiveDeleted } from '../utils/audit.js';
import mongoose from 'mongoose';
import Message from '../models/Message.js';
import ChatRead from '../models/ChatRead.js';
import Group from '../models/Group.js';
import { requireAuth } from '../middleware/auth.js';
import { visibleGroups } from '../utils/scope.js';
import { resolveChannel, titleKeyFor, canEditMessage, deleteModeFor, deletedFilter, seesDeletedMessages, dmPeerOf, isDmKey, canUseFinanceChat } from '../utils/chatPolicy.js';
import User from '../models/User.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { clean } from '../utils/validate.js';
import { olderThan, NEWEST_FIRST } from '../utils/paging.js';
import { chatLimit } from '../middleware/limits.js';
import { chatEvent, navChangedFor, dmEvent } from '../socket/events.js';
import { imageUpload, describeUpload, checkImages, uploadLimiter } from '../utils/uploads.js';
import { imageUrl } from '../utils/fileRefs.js';

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
  images: (m.images ?? []).map(imageUrl),
  createdAt: m.createdAt,
  editedAt: m.editedAt,
  deletedAt: m.deletedAt ?? null,
});

// A message is text, images, or both; `hasImages` says whether it will
// carry any, so text may then be left out.
function checkContent(value, hasImages = false) {
  const content = typeof value === 'string' ? clean(value).trim() : '';
  if (!content && !hasImages) throw badRequest('Write a message first');
  if (content.length > 2000) throw badRequest('Messages can be at most 2000 characters');
  return content;
}

// What a message reads as where only one line fits (the DM list, popups).
export const previewOf = (m) => m.content || (m.images?.length > 1 ? `${m.images.length} images` : 'Image');

// Unread counts for every chat this user can open (used for nav badges).
export async function chatUnreadCounts(user) {
  const groups = await Group.find({}, 'name slug').lean();
  const channels = [
    { key: 'general', titleKey: 'general' },
    ...visibleGroups(user, groups).map((g) => ({ key: `group:${g._id}`, titleKey: `group-${g.slug}` })),
    ...(canUseFinanceChat(user) ? [{ key: 'finance', titleKey: 'finance' }] : []),
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
      ...deletedFilter(user),
    });
    if (count) counts[c.titleKey] = count;
  }));
  return counts;
}

// GET /api/chat/:titleKey/messages?before=<ISO>
router.get('/:titleKey/messages', async (req, res) => {
  const channel = await resolveChannel(req.user, req.params.titleKey);
  const filter = { channelKey: channel.key, ...deletedFilter(req.user), ...olderThan(req.query) };

  const found = await Message.find(filter).sort(NEWEST_FIRST).limit(PAGE_SIZE + 1)
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

// POST /api/chat/:titleKey/upload — multipart `images` files (up to five,
// PNG, JPEG, GIF or WebP); returns the references to send with the message.
router.post('/:titleKey/upload', uploadLimiter(), async (req, res, next) => {
  await resolveChannel(req.user, req.params.titleKey);
  next();
}, imageUpload, (req, res) => {
  res.status(201).json({ images: (req.files ?? []).map(describeUpload) });
});

// POST /api/chat/:titleKey/messages { content, images? }
router.post('/:titleKey/messages', chatLimit, async (req, res) => {
  const channel = await resolveChannel(req.user, req.params.titleKey);
  const images = (await checkImages(req.body.images)) ?? [];
  const content = checkContent(req.body.content, images.length > 0);

  const message = await new Message({
    channelKey: channel.key,
    group: channel.group?._id ?? null,
    author: req.user._id,
    ...(channel.kind === 'dm' ? { peers: channel.peers } : {}),
    content,
    images,
  }).save();
  await message.populate('author', AUTHOR_FIELDS);

  // Sending counts as having read the chat.
  await ChatRead.touch(req.user._id, channel.key, message.createdAt);

  sendChatEvent('chat:new', channel, req.user, (titleKey, peer) => ({
    titleKey, channelName: peer ? peer.name : channel.name, message: serialize(message), dm: channel.kind === 'dm',
  }));
  res.status(201).json({ message: serialize(message) });
});

// Sends a chat event to everyone in the channel. In a DM each side gets the
// title key that names the other person.
function sendChatEvent(event, channel, user, payloadFor) {
  if (channel.kind !== 'dm') {
    chatEvent(event, channel, payloadFor(titleKeyFor(channel.key, channel.group?.slug)));
    return;
  }
  const me = { _id: user._id, name: user.name };
  const them = channel.other;
  dmEvent(event, String(user._id), payloadFor(`dm-${them._id}`, them));
  dmEvent(event, String(them._id), payloadFor(`dm-${me._id}`, me));
  if (event === 'chat:new') { navChangedFor(user._id); navChangedFor(them._id); }
}

async function findMessage(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Message not found');
  const message = await Message.findById(req.params.id).populate('author', AUTHOR_FIELDS);
  if (!message || (message.deletedAt && !seesDeletedMessages(req.user))) throw notFound('Message not found');
  // Re-check that the user may open this chat at all.
  if (isDmKey(message.channelKey) && !message.peers?.some((p) => String(p) === String(req.user._id))) throw notFound('Message not found');
  const titleKey = message.channelKey.startsWith('group:')
    ? `group-${(await Group.findById(message.group).lean())?.slug}`
    : isDmKey(message.channelKey) ? `dm-${dmPeerOf(message.channelKey, req.user._id)}` : message.channelKey;
  const channel = await resolveChannel(req.user, titleKey);
  return { message, channel, titleKey };
}

router.patch('/messages/:id', async (req, res) => {
  const { message, channel } = await findMessage(req);
  if (!canEditMessage(req.user, message)) throw forbidden('You can only edit your own messages');
  message.content = checkContent(req.body.content, message.images?.length > 0);
  message.editedAt = new Date();
  await message.save();

  sendChatEvent('chat:changed', channel, req.user, (key) => ({ titleKey: key, message: serialize(message) }));
  res.json({ message: serialize(message) });
});

router.delete('/messages/:id', async (req, res) => {
  const { message, channel, titleKey } = await findMessage(req);
  const mode = deleteModeFor(req.user, message);
  if (!mode) throw forbidden('You cannot delete this message');
  if (mode === 'hide') {
    message.deletedAt = new Date();
    await message.save();
    // No content in the event: those who may see it already have it.
    sendChatEvent('chat:deleted', channel, req.user, (key) => ({ titleKey: key, id: message._id, deletedAt: message.deletedAt }));
    return res.json({ ok: true, deletedAt: message.deletedAt });
  }
  await archiveDeleted(message, req, { model: 'Message', label: `${titleKey}: ${previewOf(message).slice(0, 80)}` });
  await message.deleteOne();

  sendChatEvent('chat:deleted', channel, req.user, (key) => ({ titleKey: key, id: message._id }));
  res.json({ ok: true });
});

// POST /api/chat/:titleKey/read — everything up to now has been seen.
router.post('/:titleKey/read', async (req, res) => {
  const channel = await resolveChannel(req.user, req.params.titleKey);
  await ChatRead.touch(req.user._id, channel.key);
  navChangedFor(req.user._id);
  res.json({ ok: true });
});

router.get('/unread', async (req, res) => {
  res.json({ counts: await chatUnreadCounts(req.user) });
});

// This user's direct message conversations, newest first, with the other
// person, the last message and how many are unread. Listed in the Chat
// channel's nav under "Direct messages".
export async function listDms(user) {
  const me = String(user._id);
  const latest = await Message.aggregate([
    { $match: { peers: user._id, ...deletedFilter(user) } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$channelKey', last: { $first: '$$ROOT' } } },
    { $sort: { 'last.createdAt': -1 } },
    { $limit: 50 },
  ]);
  const keys = latest.map((l) => l._id);
  const reads = await ChatRead.find({ user: user._id, channelKey: { $in: keys } }).lean();
  const readAt = new Map(reads.map((r) => [r.channelKey, r.lastReadAt]));
  const peerIds = latest.map((l) => dmPeerOf(l._id, me));
  const peers = await User.find({ _id: { $in: peerIds } }, 'name role group status').populate('group', 'name').lean();
  const peerOf = new Map(peers.map((p) => [String(p._id), p]));
  return Promise.all(latest.map(async (l) => {
    const peerId = dmPeerOf(l._id, me);
    const peer = peerOf.get(peerId);
    const unread = await Message.countDocuments({ channelKey: l._id, author: { $ne: user._id }, createdAt: { $gt: readAt.get(l._id) ?? user.createdAt }, ...deletedFilter(user) });
    return {
      titleKey: `dm-${peerId}`,
      peer: { id: peerId, name: peer?.name ?? 'Former member', role: peer?.role ?? 'member', group: peer?.group?.name ?? null, active: peer?.status === 'active' },
      last: { content: previewOf(l.last).slice(0, 120), at: l.last.createdAt, mine: String(l.last.author) === me },
      unread,
    };
  }));
}

// GET /api/chat/dms
router.get('/dms', async (req, res) => {
  const dms = await listDms(req.user);
  res.json({ dms, unread: dms.reduce((n, d) => n + d.unread, 0) });
});

export default router;
