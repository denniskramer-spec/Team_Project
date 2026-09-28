// A group has one group report and one group plan per period. Any boss of
// the group may write it; the last save wins and names its author.
//
// `Model` is Report or Plan, `field` the person field ('author' / 'owner').

// The group's record for a period (the newest, should older copies exist).
export const findGroupRecord = (Model, { group, type, period }) => (
  Model.findOne({ scope: 'group', group, type, period }).sort({ updatedAt: -1 })
);

// Creates or updates it, and removes copies other bosses saved before this
// rule existed.
export async function saveGroupRecord(Model, field, user, { type, period }, fields) {
  const key = { scope: 'group', group: user.group, type, period };
  const current = await findGroupRecord(Model, key);
  if (current) await Model.deleteMany({ ...key, _id: { $ne: current._id } });
  // A group record this boss wrote for another group in the same period
  // (they moved) stays that group's; only its author field must not clash.
  return Model.findOneAndUpdate(
    current ? { _id: current._id } : key,
    { ...fields, ...key, [field]: user._id },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

// Newest record per group, for lists.
export function latestPerGroup(records) {
  const byGroup = new Map();
  for (const r of records) {
    const key = String(r.group?._id ?? r.group);
    const seen = byGroup.get(key);
    if (!seen || r.updatedAt > seen.updatedAt) byGroup.set(key, r);
  }
  return [...byGroup.values()];
}

// May this user change the group record? Its group's bosses may.
export const canChangeGroupRecord = (user, record) => (
  user.role === 'boss' && Boolean(user.group) && String(record.group?._id ?? record.group) === String(user.group)
);
