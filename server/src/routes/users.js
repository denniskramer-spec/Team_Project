import { Router } from 'express';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Lightweight list of active members, used by the right-hand member panel.
// Full member management arrives in Step 4.
router.get('/directory', requireAuth, async (req, res) => {
  const users = await User.find({ status: 'active' }, 'name username memberId role group')
    .populate('group', 'name slug')
    .sort('name')
    .lean();
  res.json({
    users: users.map((u) => ({
      id: u._id,
      name: u.name,
      username: u.username,
      memberId: u.memberId,
      role: u.role,
      group: u.group ? { id: u.group._id, name: u.group.name, slug: u.group.slug } : null,
    })),
  });
});

export default router;
