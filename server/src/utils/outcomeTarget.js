import mongoose from 'mongoose';
import User from '../models/User.js';
import Group from '../models/Group.js';
import { canRecordOutcome, canManageOutcome } from './visibility.js';
import { badRequest, forbidden } from './httpError.js';
import { checkAmount, checkText } from './validate.js';
import { ownsRecords } from './recordOwner.js';

// Who an outcome is for, from the request body:
//   { member: <id> }               one person; their group comes along
//   { team: true, group: <id> }    one group: split equally over its members
//   { team: true }                 the whole team: split over everyone (leader only)
// Returns { member, group } for one person, or
// { members: [users], group, label } for a split. Bosses and members share
// a team outcome; the team leader and admins never do.
export async function resolveTarget(req) {
  if (!canRecordOutcome(req.user)) throw forbidden('Only the team leader and bosses record outcome');

  if (req.body.team) {
    const filter = { status: 'active', role: { $in: ['member', 'boss'] } };
    let group = null;
    if (req.body.group) {
      if (!mongoose.isValidObjectId(req.body.group)) throw badRequest('Unknown group');
      group = await Group.findById(req.body.group);
      if (!group) throw badRequest('Unknown group');
      if (!canManageOutcome(req.user, { _id: null, group: group._id })) throw forbidden('You cannot record costs for that group');
      filter.group = group._id;
    } else if (req.user.role !== 'leader') {
      throw forbidden('Only the team leader records costs for the whole team');
    }
    const members = await User.find(filter, 'name group').sort('name');
    if (!members.length) throw badRequest(group ? `${group.name} has no members to share this outcome` : 'There are no members to share this outcome');
    return { members, group: group?._id ?? null, label: group ? `${group.name} team` : 'Whole team' };
  }

  if (!mongoose.isValidObjectId(req.body.member)) throw badRequest('Choose a member');
  const member = await User.findById(req.body.member);
  if (!member || member.status !== 'active' || !ownsRecords(member)) throw badRequest('Unknown member');
  if (!canManageOutcome(req.user, member)) throw forbidden('You cannot record outcome for that member');
  return { member: member._id, group: member.group ?? null };
}

// Splits `total` into `count` shares in cents; the first shares carry the
// odd cents so the shares always add up to the total.
export function shares(total, count) {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const extra = cents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i < extra ? 1 : 0)) / 100);
}

// Shared checks for amount, reason and comment.
export function checkMoneyFields(body, partial = false) {
  const fields = {};
  if (!partial || body.amount !== undefined) fields.amount = checkAmount(body.amount);
  if (!partial || body.reason !== undefined) {
    fields.reason = checkText(body.reason, 'Reason', 120);
    if (!fields.reason) throw badRequest('Give a reason for the outcome');
  }
  if (body.comment !== undefined) fields.comment = checkText(body.comment, 'Comment', 2000);
  return fields;
}

// Can this user see a record for this member / group?
export function inScope(user, record) {
  if (['admin', 'leader'].includes(user.role)) return true;
  const group = record.group?._id ?? record.group;
  const member = record.member?._id ?? record.member;
  if (user.role === 'boss') return Boolean(user.group) && String(group) === String(user.group);
  return Boolean(member) && String(member) === String(user._id);
}
