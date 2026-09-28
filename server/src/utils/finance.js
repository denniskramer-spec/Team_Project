import mongoose from 'mongoose';
import Group from '../models/Group.js';
import User from '../models/User.js';
import { parsePeriod, periodKey, shiftPeriod } from './period.js';
import { scopeFilter, canReadTeam, canSeeMember } from './visibility.js';
import { visibleGroups } from './scope.js';
import { badRequest, notFound } from './httpError.js';

// Shared by the Finance routes (income, outcome, total): which period a
// request asks for and whose records it may see.

// Toolbar types map to reporting period types; `range` is a free duration.
const TYPES = {
  week: 'weekly', month: 'monthly', quarter: 'quarterly', 'half-year': 'halfyear', year: 'annual',
  weekly: 'weekly', monthly: 'monthly', quarterly: 'quarterly', halfyear: 'halfyear', annual: 'annual',
  range: 'range',
};

// A custom duration loads every record in it, so it is capped.
const MAX_RANGE_DAYS = 5 * 366;

const DAY_LABEL = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };

function parseDay(value, what) {
  const day = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(day.getTime())
    || day.toISOString().slice(0, 10) !== value) {
    throw badRequest(`Invalid ${what}, expected YYYY-MM-DD`);
  }
  return day;
}

// The period behind a Finance request:
//   ?type=week|month|year                 the current one, or ?period=<key> / ?date=YYYY-MM-DD inside it
//   ?type=range&from=YYYY-MM-DD&to=...    any duration, both days included
export function financePeriod(query) {
  const type = TYPES[query.type || 'month'];
  if (!type) throw badRequest('Finance periods are week, month, quarter, half-year, year or range');

  if (type === 'range') {
    const start = parseDay(query.from, 'start of the duration');
    const last = parseDay(query.to, 'end of the duration');
    if (last < start) throw badRequest('The duration ends before it starts');
    if (last - start > MAX_RANGE_DAYS * 86400000) throw badRequest(`A duration can be at most ${MAX_RANGE_DAYS / 366} years`);
    const end = new Date(last);
    end.setUTCDate(end.getUTCDate() + 1);
    const label = query.from === query.to
      ? start.toLocaleDateString('en-GB', DAY_LABEL)
      : `${start.toLocaleDateString('en-GB', DAY_LABEL)} – ${last.toLocaleDateString('en-GB', DAY_LABEL)}`;
    return {
      key: `${query.from}_${query.to}`, type, start, end, label,
      days: Math.round((end - start) / 86400000),
      prev: null, next: null, hasNext: false, isCurrent: false,
    };
  }

  let key = query.period;
  if (!key && query.date) key = periodKey(type, parseDay(query.date, 'date'));
  const period = parsePeriod(type, key || periodKey(type));
  const nextKey = shiftPeriod(type, period.key, 1);
  return {
    ...period,
    type,
    prev: shiftPeriod(type, period.key, -1),
    next: nextKey,
    hasNext: parsePeriod(type, nextKey).start <= new Date(),
    isCurrent: period.key === periodKey(type),
  };
}

export const inPeriod = (period) => ({ $gte: period.start, $lt: period.end });

// The records this role may see in the period, narrowed to ?group=<slug>
// and ?member=<id>. `field` is the record's owner field ('member').
export async function financeScope(req, field = 'member') {
  const period = financePeriod(req.query);
  const filter = { ...scopeFilter(req.user, field), date: inPeriod(period) };

  const groups = await Group.find({}, 'name slug').lean();
  const allowed = canReadTeam(req.user) ? visibleGroups(req.user, groups) : [];
  if (req.query.group && req.query.group !== 'all') {
    const group = allowed.find((g) => g.slug === req.query.group);
    if (!group) throw notFound('Group not found');
    filter.group = group._id;
  }

  if (req.query.member) {
    const member = await User.findById(mongoose.isValidObjectId(req.query.member) ? req.query.member : null);
    if (!member || !canSeeMember(req.user, member)) throw notFound('Member not found');
    filter[field] = member._id;
  }

  return { period, filter, allowed, groupId: filter.group, memberId: filter[field] };
}

// Active members and bosses whose records are in scope: everyone gets a
// chart column, so people with nothing recorded still show up.
export function peopleInScope(user, { groupId, memberId }) {
  const filter = { ...scopeFilter(user, '_id'), status: 'active', role: { $in: ['member', 'boss'] } };
  if (groupId) filter.group = groupId;
  if (memberId) filter._id = memberId;
  return User.find(filter, 'name role').sort('name').lean();
}

// Sum per group over everything this role may see — not narrowed by the
// chosen group or member, so the group tiles always compare side by side.
export async function perGroupSums(Model, user, allowed, period) {
  if (!allowed.length) return new Map();
  const sums = await Model.aggregate([
    { $match: { ...scopeFilter(user, 'member'), group: { $in: allowed.map((g) => g._id) }, date: inPeriod(period) } },
    { $group: { _id: '$group', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  return new Map(sums.map((g) => [String(g._id), g]));
}

export const groupList = (allowed) => allowed.map((g) => ({ id: g._id, name: g.name, slug: g.slug }));

export const scopeName = (user) => (canReadTeam(user) ? (user.role === 'boss' ? 'group' : 'all') : 'self');

// { id, name, role } for a populated member, or null.
export const person = (m) => (m?._id ? { id: m._id, name: m.name, role: m.role } : null);

// A record with no member is a team cost: of one group, or of the whole
// team. It is shown like a person, with a pseudo id, so charts and history
// can give it a column or a section of its own.
export const teamPerson = (group) => ({
  id: `team:${group?._id ?? group ?? 'all'}`,
  name: group?.name ? `${group.name} team` : 'Team',
  role: 'team',
});
export const who = (r) => person(r.member) ?? teamPerson(r.group);
export const whoKey = (r) => (r.member ? String(r.member._id ?? r.member) : `team:${r.group?._id ?? r.group ?? 'all'}`);

// Sum and count per member (team costs included as their own entries), sorted by amount.
export function perMember(records) {
  const byMember = new Map();
  records.forEach((r) => {
    const key = whoKey(r);
    const entry = byMember.get(key) ?? { member: who(r), amount: 0, count: 0 };
    entry.amount += r.amount;
    entry.count += 1;
    byMember.set(key, entry);
  });
  return byMember;
}
