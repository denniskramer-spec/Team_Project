import { seesAllGroups } from './scope.js';

// Shared role rules for records that belong to one member (tasks, income):
//   team leader, admin : everything
//   boss               : their own group
//   member             : only their own
//
// `field` is the record's owner field ('owner' for tasks, 'member' for income).

export function scopeFilter(user, field) {
  if (seesAllGroups(user)) return {};
  if (user.role === 'boss' && user.group) return { group: user.group };
  return { [field]: user._id };
}

export const canReadTeam = (user) => seesAllGroups(user) || (user.role === 'boss' && Boolean(user.group));

// Whose records this user may create or change.
export function canManageFor(actor, target) {
  if (seesAllGroups(actor)) return true;
  if (actor.role === 'boss') return Boolean(actor.group) && String(target.group) === String(actor.group);
  return String(target._id) === String(actor._id);
}

// Can this user read one specific member's records?
export function canSeeMember(user, member) {
  if (seesAllGroups(user)) return true;
  if (user.role === 'boss' && user.group) return String(member.group) === String(user.group);
  return String(member._id) === String(user._id);
}

// Members this user may pick as the owner of a new record.
export function assignableFilter(user) {
  const base = { status: 'active', role: { $in: ['member', 'boss'] } };
  if (seesAllGroups(user)) return base;
  if (user.role === 'boss' && user.group) return { ...base, group: user.group };
  return { ...base, _id: user._id };
}

// Outcome (money going out) is recorded by the team leader and bosses only:
// the leader for anyone, a boss for their own group.
export const canRecordOutcome = (user) => user.role === 'leader' || (user.role === 'boss' && Boolean(user.group));
export const canManageOutcome = (actor, target) => canRecordOutcome(actor) && canManageFor(actor, target);
