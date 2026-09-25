import { visibleGroups } from '../utils/scope.js';

// Builds the navigation tree (section 1 -> section 2) for one user.
// Titles are computed from live data, so new groups, members and tasks show up
// without code changes. Section 3 content is keyed by channel + title + query.
//
// Group-scoped channels use a three-level tree:
//   report type / period   (the title)
//   -> All / Group1 / ...  (?g=<slug>)
//      -> the members in it (?m=<id>)

const groupTitles = (groups) => groups.map((g) => ({ key: g.slug, name: g.name, groupId: g._id }));
const ALL = { key: 'all', name: 'All' };

const withBadges = (titles, counts) => titles.map((t) => (counts[t.key] ? { ...t, badge: counts[t.key] } : t));
const sum = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);

const memberChild = (m) => ({
  key: `m-${m._id}`,
  name: m.name,
  role: m.role,
  queryKey: 'm',
  queryValue: String(m._id),
});

const inGroup = (members, groupId) => members.filter((m) => String(m.group) === String(groupId)).map(memberChild);

// The group level of a group-scoped channel, with each group's members under it.
// The leader and admins get every group, a boss their own, and a member none —
// they only ever see their own records.
function groupLevel(user, groups, members) {
  if (!['admin', 'leader', 'boss'].includes(user.role)) return [];
  const scoped = visibleGroups(user, groups);
  const branches = scoped.map((g) => ({
    key: `g-${g.slug}`,
    name: g.name,
    section: 'Group',
    queryKey: 'g',
    queryValue: g.slug,
    groupId: g._id,
    children: inGroup(members, g._id),
  }));

  if (user.role === 'boss') return branches;

  const inScope = new Set(scoped.map((g) => String(g._id)));
  return [
    {
      key: 'g-all',
      name: 'All',
      section: 'Group',
      queryKey: 'g',
      queryValue: '',
      children: members.filter((m) => inScope.has(String(m.group))).map(memberChild),
    },
    ...branches,
  ];
}

// Report titles: the groups a role may read, each holding its members.
// A member has no group level, so they get a single "My report" entry.
function reportTitles(user, groups, members, ownLabel = 'My report') {
  if (!['admin', 'leader', 'boss'].includes(user.role)) {
    return [{ key: 'me', name: ownLabel, section: ownLabel === 'My report' ? 'Report' : 'Assets' }];
  }
  const scoped = visibleGroups(user, groups);
  const branches = scoped.map((g) => ({
    key: g.slug,
    name: g.name,
    section: 'Group',
    groupId: g._id,
    children: inGroup(members, g._id),
  }));
  if (user.role === 'boss') return branches;

  const inScope = new Set(scoped.map((g) => String(g._id)));
  return [
    {
      key: 'all',
      name: 'All',
      section: 'Group',
      children: members.filter((m) => inScope.has(String(m.group))).map(memberChild),
    },
    ...branches,
  ];
}

// Instruction titles: All and the groups this role may see. For the leader,
// admins and bosses each group expands to its members, so an instruction can
// go to one person.
function instructionTitles(user, groups, members) {
  const scoped = visibleGroups(user, groups);
  const canAddress = ['admin', 'leader', 'boss'].includes(user.role);
  const inScope = new Set(scoped.map((g) => String(g._id)));
  return [
    {
      ...ALL,
      children: canAddress ? members.filter((m) => inScope.has(String(m.group))).map(memberChild) : undefined,
    },
    ...scoped.map((g) => ({
      key: g.slug,
      name: g.name,
      groupId: g._id,
      children: canAddress ? inGroup(members, g._id) : undefined,
    })),
  ];
}

export function buildNav(user, groups, {
  pendingCount = 0, instructionUnread = {}, chatUnread = {}, tasks = [], members = [],
} = {}) {
  const allGroups = groupTitles(groups);
  const scoped = groupTitles(visibleGroups(user, groups));
  const level = () => groupLevel(user, groups, members);

  const channels = [
    {
      key: 'instruction',
      name: 'Instruction',
      icon: 'megaphone',
      // The leader and bosses can also instruct one person, so groups expand
      // to their members. Members themselves just read.
      titles: withBadges(instructionTitles(user, groups, members), instructionUnread),
      badge: sum(instructionUnread),
    },
    {
      key: 'report',
      name: 'Report',
      icon: 'clipboard',
      // Daily reports only, so the titles are just who to look at.
      titles: reportTitles(user, groups, members),
    },
    {
      key: 'plan',
      name: 'Plan',
      icon: 'target',
      titles: [
        { key: 'weekly', name: 'Weekly plan', section: 'Plan' },
        { key: 'monthly', name: 'Monthly plan', section: 'Plan' },
        ...level(),
      ],
    },
    {
      key: 'checkout',
      name: 'Checkout',
      icon: 'chart',
      titles: [
        { key: 'weekly', name: 'Weekly', section: 'Period' },
        { key: 'monthly', name: 'Monthly', section: 'Period' },
        { key: 'yearly', name: 'Yearly', section: 'Period' },
        ...level(),
      ],
    },
    {
      key: 'task',
      name: 'Task',
      icon: 'check',
      titles: [
        { key: 'all', name: 'All tasks', section: 'Tasks' },
        ...tasks.map((t) => ({ key: String(t._id), name: t.name, section: 'Task names', status: t.status })),
      ],
    },
    {
      key: 'asset',
      name: 'Assets',
      icon: 'idcard',
      // Same shape as Report: who to look at, scoped by role.
      titles: reportTitles(user, groups, members, 'My assets'),
    },
    {
      key: 'member',
      name: 'Member',
      icon: 'users',
      // The directory is open to everyone, so every group is listed.
      titles: [
        { ...ALL, section: 'Group' },
        ...allGroups.map((g) => ({ ...g, section: 'Group', children: inGroup(members, g.groupId) })),
      ],
    },
    {
      key: 'finance',
      name: 'Finance',
      icon: 'coins',
      // Income, outcome (leader and bosses record it) and the total of both.
      // The period is picked in the page toolbar, not here.
      titles: [
        { key: 'income', name: 'Income', section: 'Finance' },
        { key: 'outcome', name: 'Outcome', section: 'Finance' },
        { key: 'total', name: 'Total', section: 'Finance' },
        ...level(),
      ],
    },
    {
      key: 'chat',
      name: 'Chat',
      icon: 'chat',
      titles: withBadges([
        { key: 'general', name: 'general-chat' },
        ...scoped.map((g) => ({ key: `group-${g.key}`, name: `${g.name.toLowerCase()}-chat`, groupId: g.groupId })),
        { key: 'finance', name: 'finance-chat' },
      ], chatUnread),
      badge: sum(chatUnread),
    },
  ];

  const adminTitles = [];
  if (['admin', 'leader', 'boss'].includes(user.role)) adminTitles.push({ key: 'approvals', name: 'Approvals', badge: pendingCount });
  if (user.role === 'admin') {
    adminTitles.push({ key: 'users', name: 'Users & roles' }, { key: 'groups', name: 'Groups' });
  }
  if (adminTitles.length) {
    channels.push({ key: 'admin', name: 'Admin', icon: 'shield', titles: adminTitles, badge: pendingCount });
  }

  return channels;
}
