import { ROLE_LABELS } from './components/RoleBadge.jsx';

// What the client needs to know about roles to show or hide a control. The
// server checks every request again.

// Roles from the most to the least powerful: the order tables sort by.
export const ROLE_ORDER = Object.keys(ROLE_LABELS);

// Admins and the team leader: they manage accounts, groups and fees and see
// every group.
export const isManager = (user) => ['admin', 'leader'].includes(user?.role);

// Members and bosses own records (residents, chat accounts, projects); the
// leader and admins record them for others.
// Bosses, the leader and admins still see chat messages a member deleted.
export const seesDeletedMessages = (user) => ['boss', 'leader', 'admin'].includes(user?.role);

export const ownsRecords = (user) => ['member', 'boss'].includes(user?.role);
