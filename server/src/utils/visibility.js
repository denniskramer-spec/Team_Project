import mongoose from 'mongoose';
import User from '../models/User.js';
import Group from '../models/Group.js';
import { seesAllGroups, visibleGroups } from './scope.js';
import { notFound } from './httpError.js';

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

// May this user see one record (a project, a resident, an account) already
// loaded? The same rule as scopeFilter; `field` is the record's owner field.
// A record outside the scope looks like it does not exist.
export function visibleRecord(user, record, field) {
  const scope = scopeFilter(user, field);
  const id = (v) => String(v?._id ?? v);
  return (!scope.group || id(record.group) === String(scope.group))
    && (!scope[field] || id(record[field]) === String(scope[field]));
}

// What a list covers, for the response: every group, this boss's group, or
// only the caller's own records.
export const scopeName = (user) => (canReadTeam(user) ? (user.role === 'boss' ? 'group' : 'all') : 'self');

// The ?group=<slug> and ?member=<id> narrowing of a list request, limited to
// what this role may read: a group or a member outside it is "not found".
// Returns the groups the role may pick from, the record filter (scopeFilter
// plus the narrowing, on the record's owner `field`) and the ids picked.
export async function narrowScope(req, field) {
  const { user } = req;
  const groups = await Group.find({}, 'name slug').lean();
  const allowed = canReadTeam(user) ? visibleGroups(user, groups) : [];
  const filter = scopeFilter(user, field);
  let groupId = null;
  if (req.query.group && req.query.group !== 'all') {
    const group = allowed.find((g) => g.slug === req.query.group);
    if (!group) throw notFound('Group not found');
    filter.group = group._id;
    groupId = group._id;
  }
  let memberId = null;
  if (req.query.member) {
    const member = await User.findById(mongoose.isValidObjectId(req.query.member) ? req.query.member : null);
    if (!member || !canSeeMember(user, member)) throw notFound('Member not found');
    filter[field] = member._id;
    memberId = member._id;
  }
  return { allowed, filter, groupId, memberId };
}

// The members this user may pick as the owner of a new record, as the
// forms list them.
export async function assignableMembers(user) {
  const users = await User.find(assignableFilter(user), 'name role group').populate('group', 'name').sort('name').lean();
  return users.map((u) => ({ id: u._id, name: u.name, role: u.role, group: u.group?.name ?? null }));
}
