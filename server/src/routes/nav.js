import { Router } from 'express';
import Group from '../models/Group.js';
import User from '../models/User.js';
import Instruction from '../models/Instruction.js';
import Task from '../models/Task.js';
import { pendingFilter } from '../utils/memberPolicy.js';
import { unreadFilter } from '../utils/instructionPolicy.js';
import { scopeFilter } from '../utils/visibility.js';
import { chatUnreadCounts } from './chat.js';
import { requireAuth } from '../middleware/auth.js';
import { buildNav } from '../config/channels.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const groups = await Group.find({}, 'name slug').sort('name').lean();
  const filter = ['admin', 'leader', 'boss'].includes(req.user.role) ? pendingFilter(req.user) : null;
  const pendingCount = filter ? await User.countDocuments(filter) : 0;

  // Unread instructions per title: "all" (which also lists the ones sent
  // directly to this user) plus the user's own group.
  const unread = await Instruction.aggregate([
    { $match: unreadFilter(req.user) },
    { $group: { _id: '$target', count: { $sum: 1 } } },
  ]);
  const ownGroup = groups.find((g) => req.user.group && String(g._id) === String(req.user.group));
  const instructionUnread = {};
  for (const u of unread) {
    const key = u._id === 'group' ? ownGroup?.slug : 'all';
    if (key) instructionUnread[key] = (instructionUnread[key] ?? 0) + u.count;
  }

  const chatUnread = await chatUnreadCounts(req.user);

  // Members shown under each group in the tree.
  const members = await User.find({ status: 'active', role: { $in: ['member', 'boss'] } }, 'name role group')
    .sort('name').lean();

  // Task names become titles under the Task channel (most recent first).
  const tasks = await Task.find(scopeFilter(req.user, 'owner'), 'name status')
    .sort({ startDate: -1, createdAt: -1 }).limit(40).lean();

  res.json({ channels: buildNav(req.user, groups, { pendingCount, instructionUnread, chatUnread, tasks, members }) });
});

export default router;
