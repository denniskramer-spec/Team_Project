import { seesAllGroups } from './scope.js';

// Report rules from the project guide:
//  - members write their own reports
//  - bosses write their own plus a group report for their group
//  - the team leader and admins only read
//  - nobody can edit anyone else's report, whatever their role
//
// Who can read whose reports:
//  - team leader, admin : every member, every group
//  - boss               : their own group only
//  - member             : only their own

export const canWritePersonal = (user) => ['member', 'boss'].includes(user.role);
export const canWriteGroup = (user) => user.role === 'boss' && Boolean(user.group);
export const isReader = (user) => ['leader', 'admin'].includes(user.role);

export function readableAuthorFilter(user) {
  if (seesAllGroups(user)) return {};
  if (user.role === 'boss' && user.group) return { group: user.group };
  return { _id: user._id };
}

// Who sees the team table and the group reports at all.
export const canReadTeam = (user) => seesAllGroups(user) || (user.role === 'boss' && Boolean(user.group));
export const canReadGroupReports = canReadTeam;
