import mongoose from 'mongoose';
import User from '../models/User.js';
import Group from '../models/Group.js';
import { canRecordOutcome, canManageOutcome } from './visibility.js';
import { badRequest, forbidden } from './httpError.js';

// Who an outcome is for, from the request body:
//   { member: <id> }                a person; their group comes along
//   { team: true, group: <id> }     a cost of one group
//   { team: true }                  a cost of the whole team (leader only)
// Returns { member, group } as ids (or null).
export async function resolveTarget(req) {
  if (!canRecordOutcome(req.user)) throw forbidden('Only the team leader and bosses record outcome');

  if (req.body.team) {
    if (!req.body.group) {
      if (req.user.role !== 'leader') throw forbidden('Only the team leader records costs for the whole team');
      return { member: null, group: null };
    }
    if (!mongoose.isValidObjectId(req.body.group)) throw badRequest('Unknown group');
    const group = await Group.findById(req.body.group);
    if (!group) throw badRequest('Unknown group');
    if (!canManageOutcome(req.user, { _id: null, group: group._id })) throw forbidden('You cannot record costs for that group');
    return { member: null, group: group._id };
  }

  if (!mongoose.isValidObjectId(req.body.member)) throw badRequest('Choose a member');
  const member = await User.findById(req.body.member);
  if (!member || member.status !== 'active') throw badRequest('Unknown member');
  if (!canManageOutcome(req.user, member)) throw forbidden('You cannot record outcome for that member');
  return { member: member._id, group: member.group ?? null };
}

// Shared checks for amount, reason and comment.
export function checkMoneyFields(body, partial = false) {
  const fields = {};
  if (!partial || body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) throw badRequest('Amount must be 0 or more');
    if (amount > 1e12) throw badRequest('Amount is too large');
    fields.amount = Math.round(amount * 100) / 100;
  }
  if (!partial || body.reason !== undefined) {
    const reason = String(body.reason ?? '').trim();
    if (!reason) throw badRequest('Give a reason for the outcome');
    if (reason.length > 120) throw badRequest('Reason can be at most 120 characters');
    fields.reason = reason;
  }
  if (body.comment !== undefined) {
    const comment = String(body.comment).trim();
    if (comment.length > 2000) throw badRequest('Comment can be at most 2000 characters');
    fields.comment = comment;
  }
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
