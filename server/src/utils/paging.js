import mongoose from 'mongoose';
import { badRequest } from './httpError.js';

// "Load older" cursor for lists sorted newest first: ?before=<ISO date> and
// ?beforeId=<id> of the oldest row shown. The id breaks ties, so rows that
// share a timestamp with that row are not skipped. Returns a filter to AND
// with the list's own, or null when there is no cursor.
export function olderThan(query) {
  if (!query.before) return null;
  const before = new Date(query.before);
  if (Number.isNaN(before.getTime())) throw badRequest('Invalid "before" date');
  if (!query.beforeId) return { createdAt: { $lt: before } };
  if (!mongoose.isValidObjectId(query.beforeId)) throw badRequest('Invalid "beforeId"');
  return {
    $or: [
      { createdAt: { $lt: before } },
      { createdAt: before, _id: { $lt: new mongoose.Types.ObjectId(query.beforeId) } },
    ],
  };
}

export const NEWEST_FIRST = { createdAt: -1, _id: -1 };
