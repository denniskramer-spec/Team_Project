// Single source of truth for roles and what each one may do.
// Route guards use these capabilities rather than checking role names directly,
// so changing who can do what only means editing this file.

export const ROLES = ['admin', 'leader', 'boss', 'member'];

export const ROLE_LABELS = {
  admin: 'Admin',
  leader: 'Team Leader',
  boss: 'Boss',
  member: 'Member',
};

export const CAPABILITIES = {
  manageUsers: ['admin'], // change roles
  manageGroups: ['admin'],
  addMembers: ['admin', 'leader', 'boss'], // bosses: own group only
  approveSignups: ['admin', 'leader', 'boss'], // bosses: own group only
  sendInstructions: ['leader', 'boss'], // bosses: own group only
  viewAllReports: ['admin', 'leader'],
  writeGroupReport: ['boss'],
};

export const can = (user, capability) =>
  Boolean(user && CAPABILITIES[capability]?.includes(user.role));
