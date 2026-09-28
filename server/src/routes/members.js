import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Group from '../models/Group.js';
import { requireAuth, requireCapability } from '../middleware/auth.js';
import { ROLES } from '../config/roles.js';
import { permissionsFor, pendingFilter } from '../utils/memberPolicy.js';
import { tempPassword } from '../utils/password.js';
import {
  requireFields, checkUsername, checkPassword, checkName, parseBirthday,
} from '../utils/validate.js';
import { badRequest, forbidden, notFound, conflict } from '../utils/httpError.js';
import Asset from '../models/Asset.js';
import { scopeFilter } from '../utils/visibility.js';
import { moveRecordsToGroup } from '../utils/moveRecords.js';
import { assetSentence } from './assets.js';
import { approvalsChanged, directoryChanged, navChanged, sessionChanged } from '../socket/events.js';

const router = Router();
router.use(requireAuth);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function serialize(user, actor) {
  const g = user.group;
  return {
    id: user._id,
    name: user.name,
    username: user.username,
    memberId: user.memberId,
    birthday: user.birthday,
    role: user.role,
    status: user.status,
    group: g?._id ? { id: g._id, name: g.name, slug: g.slug } : null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    permissions: permissionsFor(actor, user),
  };
}

async function findTarget(id) {
  if (!mongoose.isValidObjectId(id)) throw notFound('Member not found');
  const user = await User.findById(id).populate('group', 'name slug');
  if (!user) throw notFound('Member not found');
  return user;
}

async function resolveGroup(id) {
  if (id === null || id === '' || id === undefined) return null;
  if (!mongoose.isValidObjectId(id)) throw badRequest('Unknown group');
  const group = await Group.findById(id);
  if (!group) throw badRequest('Unknown group');
  return group;
}

async function assertNotLastAdmin(target) {
  if (target.role !== 'admin') return;
  const others = await User.countDocuments({ role: 'admin', status: 'active', _id: { $ne: target._id } });
  if (!others) throw conflict('There must always be at least one active admin');
}

function broadcast(targetId, opts) {
  directoryChanged();
  navChanged();
  if (targetId) sessionChanged(String(targetId), opts);
}

// ---------- Directory (Member channel) ----------

// GET /api/members?group=all|<slug>&status=active|disabled&q=text
router.get('/', async (req, res) => {
  const filter = { status: 'active' };

  if (req.query.status === 'disabled') {
    if (!['admin', 'leader'].includes(req.user.role)) throw forbidden();
    filter.status = 'disabled';
  }
  if (req.query.group && req.query.group !== 'all') {
    const group = await Group.findOne({ slug: req.query.group });
    if (!group) throw notFound('Group not found');
    filter.group = group._id;
  }
  if (req.query.q?.trim()) {
    const rx = new RegExp(escapeRegex(req.query.q.trim()), 'i');
    filter.$or = [{ name: rx }, { username: rx }, { memberId: rx }];
  }

  const users = await User.find(filter).populate('group', 'name slug').sort('name');

  // Each member's assets as one sentence, limited to the assets this role may
  // read: a member only their own, a boss their group's, the leader and admins all.
  const scope = scopeFilter(req.user, 'owner');
  const assetFilter = { owner: { $in: users.map((u) => u._id) } };
  if (scope.owner) assetFilter.owner = scope.owner;   // a member: only themselves
  if (scope.group) assetFilter.group = scope.group;   // a boss: their group
  const assets = await Asset.find(assetFilter).sort('name').lean();
  const byOwner = new Map();
  assets.forEach((a) => {
    const key = String(a.owner);
    byOwner.set(key, [...(byOwner.get(key) ?? []), assetSentence(a)]);
  });

  res.json({
    members: users.map((u) => ({
      ...serialize(u, req.user),
      assets: byOwner.get(String(u._id)) ?? [],
    })),
  });
});

// POST /api/members — add a member directly (active, must change password at first login).
router.post('/', requireCapability('addMembers'), async (req, res) => {
  requireFields(req.body, ['username', 'name']);
  const username = checkUsername(req.body.username);
  const name = checkName(req.body.name);
  const birthday = parseBirthday(req.body.birthday);

  // Only admins pick roles; bosses can only add members to their own group.
  let role = 'member';
  if (req.user.role === 'admin' && req.body.role) {
    if (!ROLES.includes(req.body.role)) throw badRequest('Unknown role');
    role = req.body.role;
  }
  let group = await resolveGroup(req.body.group);
  if (req.user.role === 'boss') {
    if (!req.user.group) throw forbidden('You are not assigned to a group');
    group = { _id: req.user.group };
  }
  if (role === 'boss' && !group) throw badRequest('A boss must belong to a group');

  if (await User.exists({ username })) throw conflict('That username is already taken');

  const generated = !req.body.password;
  const password = generated ? tempPassword() : checkPassword(req.body.password);

  const user = new User({
    username, name, birthday, role, group: group?._id ?? null, status: 'active', mustChangePassword: true,
  });
  await user.setPassword(password);
  await user.save();
  await user.populate('group', 'name slug');

  broadcast();
  res.status(201).json({ member: serialize(user, req.user), tempPassword: generated ? password : undefined });
});

// PATCH /api/members/:id — name, birthday, and (admin/leader) group.
router.patch('/:id', async (req, res) => {
  const target = await findTarget(req.params.id);
  const perms = permissionsFor(req.user, target);
  if (!perms.edit) throw forbidden();

  if (req.body.name !== undefined) {
    requireFields(req.body, ['name']);
    target.name = checkName(req.body.name);
  }
  if (req.body.birthday !== undefined) target.birthday = parseBirthday(req.body.birthday);

  let groupChanged = false;
  if (req.body.group !== undefined) {
    const group = await resolveGroup(req.body.group);
    const current = target.group?._id ? String(target.group._id) : null;
    const next = group ? String(group._id) : null;
    if (current !== next) {
      if (!perms.changeGroup) throw forbidden('You cannot move members between groups');
      if (target.role === 'boss' && !group) throw badRequest('A boss must belong to a group');
      target.group = group?._id ?? null;
      groupChanged = true;
    }
  }

  await target.save();
  if (groupChanged) await moveRecordsToGroup(target._id, target.group);
  await target.populate('group', 'name slug');
  broadcast(target._id, { disconnect: groupChanged });
  res.json({ member: serialize(target, req.user) });
});

// POST /api/members/:id/reset-password — issues a temporary password.
router.post('/:id/reset-password', async (req, res) => {
  const target = await findTarget(req.params.id);
  if (!permissionsFor(req.user, target).resetPassword) throw forbidden();

  const password = tempPassword();
  await target.setPassword(password);
  target.mustChangePassword = true;
  await target.save();

  sessionChanged(String(target._id), { disconnect: true });
  res.json({ tempPassword: password });
});

// POST /api/members/:id/status { status: 'active' | 'disabled' }
router.post('/:id/status', async (req, res) => {
  const target = await findTarget(req.params.id);
  if (!permissionsFor(req.user, target).disable) throw forbidden();
  if (!['active', 'disabled'].includes(req.body.status)) throw badRequest('Status must be active or disabled');
  if (target.status === 'pending') throw badRequest('Use approve or reject for pending sign-ups');

  if (req.body.status === 'disabled') await assertNotLastAdmin(target);
  target.status = req.body.status;
  await target.save();

  broadcast(target._id, { disconnect: target.status === 'disabled' });
  res.json({ member: serialize(target, req.user) });
});

// PATCH /api/members/:id/role { role, group? } — admins only.
// A boss leads the group they belong to, so making someone a boss also says
// which group: `group` moves them there (or they keep their current group).
router.patch('/:id/role', requireCapability('manageUsers'), async (req, res) => {
  const target = await findTarget(req.params.id);
  if (!permissionsFor(req.user, target).changeRole) throw forbidden('You cannot change your own role');
  if (!ROLES.includes(req.body.role)) throw badRequest('Unknown role');
  if (target.role === 'admin' && req.body.role !== 'admin') await assertNotLastAdmin(target);

  const groupBefore = String(target.group?._id ?? target.group ?? '');
  if (req.body.role === 'boss' && req.body.group !== undefined) {
    const group = await resolveGroup(req.body.group);
    if (!group) throw badRequest('Choose the group this boss leads');
    target.group = group._id;
  }
  if (req.body.role === 'boss' && !target.group) throw badRequest('Choose the group this boss leads');

  target.role = req.body.role;
  await target.save();
  if (String(target.group?._id ?? target.group ?? '') !== groupBefore) await moveRecordsToGroup(target._id, target.group);
  await target.populate('group', 'name slug');

  broadcast(target._id, { disconnect: true });
  res.json({ member: serialize(target, req.user) });
});

// ---------- Sign-up approvals ----------

router.get('/pending', requireCapability('approveSignups'), async (req, res) => {
  const filter = pendingFilter(req.user);
  if (!filter) return res.json({ members: [] });
  const users = await User.find(filter).populate('group', 'name slug').sort('createdAt');
  res.json({ members: users.map((u) => serialize(u, req.user)) });
});

async function findPending(req) {
  const filter = pendingFilter(req.user);
  if (!filter || !mongoose.isValidObjectId(req.params.id)) throw notFound('Sign-up not found');
  const user = await User.findOne({ ...filter, _id: req.params.id });
  if (!user) throw notFound('Sign-up not found');
  return user;
}

// POST /api/members/:id/approve { group? } — admins and leaders may (re)assign the group.
router.post('/:id/approve', requireCapability('approveSignups'), async (req, res) => {
  const user = await findPending(req);
  if (req.body.group !== undefined && ['admin', 'leader'].includes(req.user.role)) {
    user.group = (await resolveGroup(req.body.group))?._id ?? null;
  }
  user.status = 'active';
  await user.save();
  await user.populate('group', 'name slug');

  broadcast();
  res.json({ member: serialize(user, req.user) });
});

// POST /api/members/:id/reject — removes the pending sign-up entirely.
router.post('/:id/reject', requireCapability('approveSignups'), async (req, res) => {
  const user = await findPending(req);
  await user.deleteOne();
  approvalsChanged();
  res.json({ ok: true });
});

export default router;
