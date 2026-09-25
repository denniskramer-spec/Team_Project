import Group from '../models/Group.js';
import { seesAllGroups } from './scope.js';
import { notFound } from './httpError.js';

// Chat titles in the nav map to channel keys:
//   general       -> 'general'
//   finance       -> 'finance'
//   group-<slug>  -> 'group:<groupId>'
// General and finance chat are open to every active user. A group chat is for
// that group's members, plus the team leader and admins (who oversee all groups).

export async function resolveChannel(user, titleKey) {
  if (titleKey === 'general' || titleKey === 'finance') {
    return { key: titleKey, kind: titleKey, group: null, name: `${titleKey}-chat` };
  }
  const slug = titleKey.startsWith('group-') ? titleKey.slice(6) : null;
  if (!slug) throw notFound('Chat not found');

  const group = await Group.findOne({ slug });
  if (!group) throw notFound('Chat not found');
  const allowed = seesAllGroups(user) || String(user.group) === String(group._id);
  if (!allowed) throw notFound('Chat not found');

  return { key: `group:${group._id}`, kind: 'group', group, name: `${group.name.toLowerCase()}-chat` };
}

// Title key (used in URLs and nav) for a stored channel key.
export const titleKeyFor = (channelKey, groupSlug) =>
  (channelKey.startsWith('group:') ? `group-${groupSlug}` : channelKey);

// Socket rooms that should receive events for a channel.
export const roomsFor = (channel) => (channel.kind === 'group'
  ? [`group:${channel.group._id}`, 'role:leader', 'role:admin']
  : ['all']);

// Message authors can edit their own; the leader and admins can delete any.
export const canEditMessage = (user, message) => String(message.author._id ?? message.author) === String(user._id);
export const canDeleteMessage = (user, message) =>
  canEditMessage(user, message) || ['leader', 'admin'].includes(user.role);
