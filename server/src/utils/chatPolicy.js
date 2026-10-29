import Group from '../models/Group.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import { seesAllGroups } from './scope.js';
import { notFound } from './httpError.js';

// Chat titles in the nav map to channel keys:
//   general       -> 'general'
//   finance       -> 'finance'
//   group-<slug>  -> 'group:<groupId>'
//   dm-<userId>   -> 'dm:<idA>:<idB>'   (the two ids sorted, so both sides agree)
// General chat is open to every active user. Finance chat is for bosses and
// the team leader only. A group chat is for that group's members, plus the
// team leader and admins (who oversee all groups). A direct message is
// between two active people, whoever they are.

export const canUseFinanceChat = (user) => ['boss', 'leader'].includes(user.role);
export const dmKey = (a, b) => `dm:${[String(a), String(b)].sort().join(':')}`;
export const isDmKey = (key) => key.startsWith('dm:');
// The other side of a DM channel key, seen from `userId`.
export const dmPeerOf = (key, userId) => key.slice(3).split(':').find((id) => id !== String(userId)) ?? String(userId);

export async function resolveChannel(user, titleKey) {
  if (titleKey === 'finance' && !canUseFinanceChat(user)) throw notFound('Chat not found');
  if (titleKey === 'general' || titleKey === 'finance') {
    return { key: titleKey, kind: titleKey, group: null, name: `${titleKey}-chat` };
  }
  if (titleKey.startsWith('dm-')) {
    const otherId = titleKey.slice(3);
    if (!mongoose.isValidObjectId(otherId) || otherId === String(user._id)) throw notFound('Chat not found');
    const other = await User.findOne({ _id: otherId, status: 'active' }, 'name role group').lean();
    if (!other) throw notFound('Chat not found');
    return { key: dmKey(user._id, other._id), kind: 'dm', group: null, name: other.name, peers: [String(user._id), String(other._id)], other };
  }
  const slug = titleKey.startsWith('group-') ? titleKey.slice(6) : null;
  if (!slug) throw notFound('Chat not found');

  const group = await Group.findOne({ slug });
  if (!group) throw notFound('Chat not found');
  const allowed = seesAllGroups(user) || String(user.group) === String(group._id);
  if (!allowed) throw notFound('Chat not found');

  return { key: `group:${group._id}`, kind: 'group', group, name: `${group.name.toLowerCase()}-chat` };
}

// Title key (used in URLs and nav) for a stored channel key. A DM's title
// key depends on who is looking: it names the other person.
export const titleKeyFor = (channelKey, groupSlug, userId) => {
  if (channelKey.startsWith('group:')) return `group-${groupSlug}`;
  if (isDmKey(channelKey)) return `dm-${dmPeerOf(channelKey, userId)}`;
  return channelKey;
};

// Socket rooms that should receive events for a channel: the same people
// resolveChannel lets in. Finance chat goes to bosses and the leader only,
// never to the room every socket is in.
export const roomsFor = (channel) => {
  if (channel.kind === 'group') return [`group:${channel.group._id}`, 'role:leader', 'role:admin'];
  if (channel.kind === 'dm') return channel.peers.map((id) => `user:${id}`);
  if (channel.kind === 'finance') return ['role:boss', 'role:leader'];
  return ['all'];
};

// Message authors can edit their own until they delete it. The leader and
// admins delete any message outright. A member may delete their own, which
// only hides it: other members no longer see it, but bosses, the leader and
// admins still do, marked deleted. Bosses cannot delete.
export const seesDeletedMessages = (user) => ['boss', 'leader', 'admin'].includes(user.role);
export const deletedFilter = (user) => (seesDeletedMessages(user) ? {} : { deletedAt: null });
const isAuthor = (user, message) => String(message.author._id ?? message.author) === String(user._id);
export const canEditMessage = (user, message) => isAuthor(user, message) && !message.deletedAt;
// 'remove', 'hide' or null (may not delete).
export function deleteModeFor(user, message) {
  if (['leader', 'admin'].includes(user.role)) return 'remove';
  if (user.role === 'member' && canEditMessage(user, message)) return 'hide';
  return null;
}
