// Which groups a user may see in group-scoped channels.
// Admins and team leaders see every group; bosses and members only their own.
export const seesAllGroups = (user) => user.role === 'admin' || user.role === 'leader';

export function visibleGroups(user, groups) {
  if (seesAllGroups(user)) return groups;
  return groups.filter((g) => user.group && String(g._id) === String(user.group));
}
