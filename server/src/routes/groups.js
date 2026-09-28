import { Router } from 'express';
import mongoose from 'mongoose';
import Group, { slugify } from '../models/Group.js';
import User from '../models/User.js';
import { requireAuth, requireCapability } from '../middleware/auth.js';
import { requireFields } from '../utils/validate.js';
import { badRequest, notFound, conflict } from '../utils/httpError.js';
import { directoryChanged, navChanged } from '../socket/events.js';

const router = Router();

// Public list of group names for the sign-up form.
router.get('/options', async (req, res) => {
  const groups = await Group.find({}, 'name slug').sort('name').lean();
  res.json({ groups: groups.map((g) => ({ id: g._id, name: g.name, slug: g.slug })) });
});

// Everything below requires login.
router.use(requireAuth);

// Groups with member counts and their bosses.
router.get('/', async (req, res) => {
  const [groups, counts, bosses] = await Promise.all([
    Group.find().sort('name').lean(),
    User.aggregate([
      { $match: { status: 'active', group: { $ne: null } } },
      { $group: { _id: '$group', count: { $sum: 1 } } },
    ]),
    User.find({ role: 'boss', status: 'active' }, 'name group').lean(),
  ]);
  const countBy = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  res.json({
    groups: groups.map((g) => ({
      id: g._id,
      name: g.name,
      slug: g.slug,
      memberCount: countBy[String(g._id)] || 0,
      bosses: bosses.filter((b) => String(b.group) === String(g._id)).map((b) => ({ id: b._id, name: b.name })),
    })),
  });
});

const RESERVED_SLUGS = ['all', 'me'];

function checkGroupName(body) {
  requireFields(body, ['name']);
  const name = body.name.trim();
  if (name.length > 50) throw badRequest('Group name must be 50 characters or fewer');
  if (!/[a-z0-9]/i.test(name)) throw badRequest('Group name must contain a letter or number');
  // Group slugs share the channel tree's keys with these fixed titles.
  if (RESERVED_SLUGS.includes(slugify(name))) throw badRequest(`"${name}" is reserved, choose another group name`);
  return name;
}

async function assertUnique(name, exceptId) {
  const clash = await Group.findOne({
    $or: [{ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }, { slug: slugify(name) }],
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  });
  if (clash) throw conflict(`A group called "${clash.name}" already exists`);
}

async function findGroup(id) {
  if (!mongoose.isValidObjectId(id)) throw notFound('Group not found');
  const group = await Group.findById(id);
  if (!group) throw notFound('Group not found');
  return group;
}

const changed = () => { navChanged(); directoryChanged(); };

router.post('/', requireCapability('manageGroups'), async (req, res) => {
  const name = checkGroupName(req.body);
  await assertUnique(name);
  const group = await new Group({ name }).save();
  changed();
  res.status(201).json({ group: { id: group._id, name: group.name, slug: group.slug } });
});

router.patch('/:id', requireCapability('manageGroups'), async (req, res) => {
  const group = await findGroup(req.params.id);
  const name = checkGroupName(req.body);
  await assertUnique(name, group._id);
  group.name = name;
  await group.save();
  changed();
  res.json({ group: { id: group._id, name: group.name, slug: group.slug } });
});

// Only groups without active members can be deleted, so nobody is silently moved.
// Pending sign-ups and disabled accounts in the group are left without a group.
router.delete('/:id', requireCapability('manageGroups'), async (req, res) => {
  const group = await findGroup(req.params.id);
  const members = await User.countDocuments({ group: group._id, status: 'active' });
  if (members) throw conflict(`Move this group's ${members} member(s) to another group first`);
  await User.updateMany({ group: group._id }, { $set: { group: null } });
  await group.deleteOne();
  changed();
  res.json({ ok: true });
});

export default router;
