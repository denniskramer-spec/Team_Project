import { Router } from 'express';
import mongoose from 'mongoose';
import Asset, { ENGLISH_LEVELS } from '../models/Asset.js';
import User from '../models/User.js';
import Group from '../models/Group.js';
import { requireAuth } from '../middleware/auth.js';
import { scopeFilter, canManageFor, canReadTeam, assignableFilter, canSeeMember } from '../utils/visibility.js';
import { visibleGroups } from '../utils/scope.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { checkText, parseBirthday } from '../utils/validate.js';
import { resolveRecordOwner, ownsRecords } from '../utils/recordOwner.js';
import { assetChanged } from '../socket/events.js';

const router = Router();
router.use(requireAuth);

// Age in whole years, worked out from the birthday.
export function ageFrom(birthday) {
  if (!birthday) return null;
  const b = new Date(birthday);
  const now = new Date();
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < b.getUTCMonth()
    || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

// The whole asset as one sentence, used in the Member channel.
export const assetSentence = (a) => [
  a.name,
  ageFrom(a.birthday) !== null ? `${ageFrom(a.birthday)} years old` : null,
  a.nationality || null,
  a.englishLevel ? `English: ${a.englishLevel}` : null,
  a.contact || null,
].filter(Boolean).join(', ');

const serialize = (a, user) => ({
  id: a._id,
  name: a.name,
  birthday: a.birthday,
  age: ageFrom(a.birthday),
  nationality: a.nationality,
  contact: a.contact,
  englishLevel: a.englishLevel,
  note: a.note,
  owner: a.owner?._id ? { id: a.owner._id, name: a.owner.name, role: a.owner.role } : null,
  group: a.group?._id ? { id: a.group._id, name: a.group.name, slug: a.group.slug } : null,
  sentence: assetSentence(a),
  createdAt: a.createdAt,
  canEdit: canManageFor(user, { _id: a.owner?._id ?? a.owner, group: a.group?._id ?? a.group }),
});

function checkFields(body, partial = false) {
  const fields = {};
  if (!partial || body.name !== undefined) {
    fields.name = checkText(body.name, 'Name', 80);
    if (!fields.name) throw badRequest('Give the asset a name');
  }
  if (body.birthday !== undefined) {
    fields.birthday = parseBirthday(body.birthday);
  }
  const text = checkText;
  if (body.nationality !== undefined) fields.nationality = text(body.nationality, 'Nationality', 60);
  if (body.contact !== undefined) fields.contact = text(body.contact, 'Contact info', 160);
  if (body.note !== undefined) fields.note = text(body.note, 'Note', 2000);
  if (body.englishLevel !== undefined) {
    if (!ENGLISH_LEVELS.includes(body.englishLevel)) throw badRequest('Unknown English level');
    fields.englishLevel = body.englishLevel;
  }
  return fields;
}

// Members can only add assets for themselves; a boss for their group; the
// leader and admins for anyone.
const resolveOwner = (req, { orSelf = false } = {}) => resolveRecordOwner(req, req.body.owner, {
  orSelf, denied: 'You cannot add assets for that member',
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/assets?group=all|<slug>&member=<id>&q=text
router.get('/', async (req, res) => {
  const filter = scopeFilter(req.user, 'owner');

  const groups = await Group.find({}, 'name slug').lean();
  const allowed = canReadTeam(req.user) ? visibleGroups(req.user, groups) : [];
  if (req.query.group && req.query.group !== 'all') {
    const group = allowed.find((g) => g.slug === req.query.group);
    if (!group) throw notFound('Group not found');
    filter.group = group._id;
  }
  if (req.query.member) {
    const member = await User.findById(mongoose.isValidObjectId(req.query.member) ? req.query.member : null);
    if (!member || !canSeeMember(req.user, member)) throw notFound('Member not found');
    filter.owner = member._id;
  }
  if (req.query.q?.trim()) {
    const rx = new RegExp(escapeRegex(req.query.q.trim()), 'i');
    filter.$or = [{ name: rx }, { nationality: rx }, { contact: rx }];
  }

  const assets = await Asset.find(filter).sort('name')
    .populate('owner', 'name role').populate('group', 'name slug');

  res.json({
    assets: assets.map((a) => serialize(a, req.user)),
    levels: ENGLISH_LEVELS,
    can: { addForOthers: canReadTeam(req.user), own: ownsRecords(req.user) },
    groups: allowed.map((g) => ({ id: g._id, name: g.name, slug: g.slug })),
    scope: canReadTeam(req.user) ? (req.user.role === 'boss' ? 'group' : 'all') : 'self',
  });
});

// Members this user may add an asset for.
router.get('/owners', async (req, res) => {
  const users = await User.find(assignableFilter(req.user), 'name role group')
    .populate('group', 'name').sort('name').lean();
  res.json({ members: users.map((u) => ({ id: u._id, name: u.name, role: u.role, group: u.group?.name ?? null })) });
});

router.post('/', async (req, res) => {
  const owner = await resolveOwner(req, { orSelf: true });
  const asset = await new Asset({
    ...checkFields(req.body),
    owner: owner._id,
    group: owner.group ?? null,
    createdBy: req.user._id,
  }).save();
  await asset.populate('owner', 'name role');
  await asset.populate('group', 'name slug');

  assetChanged(asset);
  res.status(201).json({ asset: serialize(asset, req.user) });
});

async function findAsset(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Asset not found');
  const asset = await Asset.findById(req.params.id).populate('owner', 'name role').populate('group', 'name slug');
  if (!asset) throw notFound('Asset not found');
  // Assets outside this role's scope look like they do not exist.
  const scope = scopeFilter(req.user, 'owner');
  const visible = (!scope.group || String(scope.group) === String(asset.group?._id ?? asset.group))
    && (!scope.owner || String(scope.owner) === String(asset.owner?._id ?? asset.owner));
  if (!visible) throw notFound('Asset not found');
  return asset;
}

router.patch('/:id', async (req, res) => {
  const asset = await findAsset(req);
  if (!canManageFor(req.user, { _id: asset.owner._id, group: asset.group?._id ?? asset.group })) {
    throw forbidden('You cannot change this asset');
  }
  Object.assign(asset, checkFields(req.body, true));
  if (req.body.owner !== undefined) {
    const owner = await resolveOwner(req);
    asset.owner = owner._id;
    asset.group = owner.group ?? null;
  }
  await asset.save();
  await asset.populate('owner', 'name role');
  await asset.populate('group', 'name slug');

  assetChanged(asset);
  res.json({ asset: serialize(asset, req.user) });
});

router.delete('/:id', async (req, res) => {
  const asset = await findAsset(req);
  if (!canManageFor(req.user, { _id: asset.owner._id, group: asset.group?._id ?? asset.group })) {
    throw forbidden('You cannot delete this asset');
  }
  await asset.deleteOne();
  assetChanged(asset);
  res.json({ ok: true });
});

export default router;
