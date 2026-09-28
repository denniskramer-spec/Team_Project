import mongoose from 'mongoose';
import User from '../models/User.js';
import { canManageFor } from './visibility.js';
import { badRequest, forbidden } from './httpError.js';

// Tasks, income, outcome and assets belong to the people who do the work:
// members and bosses. The leader and admins record them for others, never
// for themselves — they have no column in the charts or the group totals.
export const ownsRecords = (user) => ['member', 'boss'].includes(user.role);

// Who a record is for, from a request body value.
//   nothing given  -> the caller, when creating (`orSelf`) and they own records
//   an id          -> that member, if the caller may manage their records
// `denied` is the message for someone outside the caller's reach.
export async function resolveRecordOwner(req, value, { orSelf = false, denied }) {
  const given = value !== undefined && value !== null && value !== '';
  if (!given && !orSelf) throw badRequest('Choose a member');
  if (given && typeof value !== 'string') throw badRequest('Unknown member');

  if (!given || value === String(req.user._id)) {
    if (!ownsRecords(req.user)) throw badRequest('Choose the member this is for');
    return req.user;
  }
  if (!mongoose.isValidObjectId(value)) throw badRequest('Unknown member');
  const owner = await User.findById(value);
  if (!owner || owner.status !== 'active' || !ownsRecords(owner)) throw badRequest('Unknown member');
  if (!canManageFor(req.user, owner)) throw forbidden(denied);
  return owner;
}
