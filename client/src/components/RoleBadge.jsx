export const ROLE_LABELS = {
  admin: 'Admin',
  leader: 'Team Leader',
  boss: 'Boss',
  member: 'Member',
};

export const ROLE_PLURALS = {
  admin: 'Admins',
  leader: 'Team Leaders',
  boss: 'Bosses',
  member: 'Members',
};

// A boss leads one group, so the badge can say which: <RoleBadge role="boss" group={user.group} />.
export default function RoleBadge({ role, group }) {
  const label = ROLE_LABELS[role] ?? role;
  return <span className={`role-badge role-${role}`}>{role === 'boss' && group?.name ? `${label} of ${group.name}` : label}</span>;
}
