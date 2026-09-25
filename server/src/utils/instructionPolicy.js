import { seesAllGroups } from './scope.js';

// Instruction rules from the project guide:
//  - only the team leader and bosses send and edit instructions
//  - the leader can send to everyone or to any group
//  - a boss can only send to their own group
//  - everyone else can only read

const id = (v) => (v?._id ?? v) && String(v._id ?? v);
const sameId = (a, b) => Boolean(a && b && id(a) === id(b));

export function canSendTo(user, target, groupId, recipient) {
  if (target === 'member') {
    if (!recipient) return false;
    if (user.role === 'leader') return true;                       // anyone
    if (user.role === 'boss') return sameId(recipient.group, user.group); // own group
    return false;
  }
  if (user.role === 'leader') return target === 'all' || Boolean(groupId);
  if (user.role === 'boss') return target === 'group' && sameId(groupId, user.group);
  return false;
}

// The leader can edit or delete any instruction; a boss only their own.
export function canModify(user, instruction) {
  if (user.role === 'leader') return true;
  if (user.role === 'boss') return sameId(instruction.author, user._id);
  return false;
}

export function canView(user, instruction) {
  if (instruction.target === 'all') return true;
  if (instruction.target === 'member') {
    // A direct instruction is between the two of them; the leader and admins oversee.
    return sameId(instruction.recipient, user._id)
      || sameId(instruction.author, user._id)
      || seesAllGroups(user);
  }
  return seesAllGroups(user) || sameId(instruction.group, user.group) || sameId(instruction.author, user._id);
}

// Who can see the read receipts: the author, the leader and admins.
export const canSeeReceipts = (user, instruction) =>
  sameId(instruction.author, user._id) || ['leader', 'admin'].includes(user.role);

// Users who receive an instruction: everyone in its audience except the author,
// counting only accounts that existed when it was sent.
export function audienceFilter(instruction) {
  if (instruction.target === 'member') return { _id: id(instruction.recipient) };
  return {
    status: 'active',
    _id: { $ne: id(instruction.author) },
    createdAt: { $lte: instruction.createdAt },
    ...(instruction.target === 'group' ? { group: id(instruction.group) } : {}),
  };
}

// Instructions this user has received and not yet acknowledged.
// Only instructions sent after the user joined count as unread.
export function unreadFilter(user) {
  const audience = [{ target: 'all' }, { target: 'member', recipient: user._id }];
  if (user.group) audience.push({ target: 'group', group: user.group });
  return {
    author: { $ne: user._id },
    $or: audience,
    'readBy.user': { $ne: user._id },
    createdAt: { $gte: user.createdAt },
  };
}

export const isRecipient = (user, instruction) => {
  if (sameId(instruction.author, user._id)) return false;
  if (instruction.target === 'member') return sameId(instruction.recipient, user._id);
  return instruction.createdAt >= user.createdAt
    && (instruction.target === 'all' || sameId(instruction.group, user.group));
};
