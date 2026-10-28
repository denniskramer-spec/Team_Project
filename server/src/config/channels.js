import { visibleGroups } from '../utils/scope.js';
import { canUseFinanceChat } from '../utils/chatPolicy.js';

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
function reportTitles(user, groups, members, { ownLabel = 'My report', section = 'Report' } = {}) {
  if (!['admin', 'leader', 'boss'].includes(user.role)) {
    return [{ key: 'me', name: ownLabel, section }];
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
  pendingCount = 0, instructionUnread = {}, chatUnread = {}, tasks = [], members = [], dms = [],
} = {}) {
  const allGroups = groupTitles(groups);
  const scoped = groupTitles(visibleGroups(user, groups));
  const level = () => groupLevel(user, groups, members);

  // Chat sits at the foot of the rail for every role, below the channels and
  // Admin, with a member's Settings under it.
  const chat = {
    key: 'chat',
    name: 'Chat',
    icon: 'chat',
    // Channels (finance-chat for bosses and the leader only), then this
    // person's direct messages, newest first. A DM title carries the other
    // person, so the list can draw them and their presence.
    titles: [
      ...withBadges([
        { key: 'general', name: 'general-chat', section: 'Channels' },
        ...scoped.map((g) => ({ key: `group-${g.key}`, name: `${g.name.toLowerCase()}-chat`, groupId: g.groupId, section: 'Channels' })),
        ...(canUseFinanceChat(user) ? [{ key: 'finance', name: 'finance-chat', section: 'Channels' }] : []),
      ], chatUnread),
      ...dms.map((d) => ({
        key: d.titleKey, name: d.peer.name, section: 'Direct messages', dm: d.peer, ...(d.unread ? { badge: d.unread } : {}),
      })),
    ],
    badge: sum(chatUnread) + dms.reduce((n, d) => n + d.unread, 0),
  };

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
      name: 'Dashboard',
      icon: 'dashboard',
      // The day at a glance, with the daily report written in a modal. The
      // titles are just whose day to look at.
      titles: reportTitles(user, groups, members, { ownLabel: 'My day', section: 'Dashboard' }),
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
      name: 'Projects',
      icon: 'briefcase',
      titles: [
        { key: 'all', name: 'All projects', section: 'Projects' },
        ...tasks.map((t) => ({ key: String(t._id), name: t.name, section: 'Project names', status: t.status })),
      ],
    },
    {
      key: 'resident',
      name: 'Residents',
      icon: 'userPlus',
      // Same shape as Report: who to look at, scoped by role.
      titles: reportTitles(user, groups, members, { ownLabel: 'My residents', section: 'Residents' }),
    },
    {
      key: 'chataccount',
      name: 'Chat accounts',
      icon: 'message',
      titles: reportTitles(user, groups, members, { ownLabel: 'My accounts', section: 'Chat accounts' }),
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
  ];

  // Members work from their own day: Checkout (the team's plan vs result)
  // and the Member directory are for bosses, the leader and admins. A
  // member's own records (projects, residents, chat accounts) and account
  // live together under one Settings channel under Chat at the foot of the
  // rail; the other roles keep every channel as it is.
  const forManagers = ['checkout', 'member'];
  const wrapped = ['task', 'resident', 'chataccount'];
  const visible = user.role === 'member'
    ? channels.filter((c) => !forManagers.includes(c.key) && !wrapped.includes(c.key))
    : [...channels];

  const adminTitles = [];
  if (['admin', 'leader', 'boss'].includes(user.role)) adminTitles.push({ key: 'approvals', name: 'Approvals', badge: pendingCount });
  if (['admin', 'leader'].includes(user.role)) {
    adminTitles.push(
      { key: 'users', name: 'Users & roles' }, { key: 'groups', name: 'Groups' },
      { key: 'fees', name: 'Payment fees' }, { key: 'security', name: 'Security' },
      { key: 'team', name: 'Team settings' },
    );
  }
  if (adminTitles.length) {
    visible.push({ key: 'admin', name: 'Admin', icon: 'shield', titles: adminTitles, badge: pendingCount });
  }

  visible.push(chat);
  if (user.role === 'member') {
    visible.push({
      key: 'settings',
      name: 'Settings',
      icon: 'settings',
      titles: [
        { key: 'account', name: 'Account', section: 'User settings' },
        { key: 'projects', name: 'Projects', section: 'Your records' },
        { key: 'residents', name: 'Residents', section: 'Your records' },
        { key: 'chataccounts', name: 'Chat accounts', section: 'Your records' },
      ],
    });
  }

  return visible;
}
