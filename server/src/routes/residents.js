import { Router } from 'express';
import mongoose from 'mongoose';
import Resident, { LAPTOP_SOURCES, ACCESS_TYPES } from '../models/Resident.js';
import ChatAccount from '../models/ChatAccount.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import Group from '../models/Group.js';
import { requireAuth } from '../middleware/auth.js';
import { scopeFilter, canManageFor, canReadTeam, assignableFilter, canSeeMember } from '../utils/visibility.js';
import { visibleGroups } from '../utils/scope.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { checkText, checkDay } from '../utils/validate.js';
import { resolveRecordOwner, ownsRecords } from '../utils/recordOwner.js';
import { imageUpload, describeUpload, checkImage, removeUnusedFiles, uploadLimiter } from '../utils/uploads.js';
import { fileInUse, imageUrl } from '../utils/fileRefs.js';
import { residentChanged, taskWorkChanged } from '../socket/events.js';
import { repriceResident } from '../utils/reportWork.js';

const router = Router();
router.use(requireAuth);

export const LAPTOP_LABELS = { bought: 'Bought for them', own: 'Already had one' };
export const ACCESS_LABELS = { laptop: 'Laptop', vps: 'VPS', proxy: 'Proxy' };

// The whole resident as one sentence, used in the Member channel.
export const residentSentence = (r) => [
  r.name,
  r.age !== null && r.age !== undefined ? `${r.age} years old` : null,
  r.country || null,
  r.hasLaptop ? (r.laptopSource === 'bought' ? 'laptop bought for them' : 'has a laptop') : null,
  r.accessSetUp ? `access set up${r.accessType ? ` via ${ACCESS_LABELS[r.accessType]}` : ''}` : null,
  r.sharePercent ? `${r.sharePercent}% share` : null,
].filter(Boolean).join(', ');

export const serialize = (r, user) => ({
  id: r._id,
  name: r.name,
  photo: imageUrl(r.photo),
  country: r.country,
  citizenship: r.citizenship,
  age: r.age ?? null,
  source: r.source,
  firstContact: r.firstContact,
  firstContactVia: r.firstContactVia,
  hasLaptop: r.hasLaptop,
  laptopSource: r.laptopSource ?? '',
  accessSetUp: r.accessSetUp,
  accessType: r.accessType ?? '',
  sharePercent: r.sharePercent ?? 0,
  notes: r.notes,
  owner: r.owner?._id ? { id: r.owner._id, name: r.owner.name, role: r.owner.role } : null,
  group: r.group?._id ? { id: r.group._id, name: r.group.name, slug: r.group.slug } : null,
  sentence: residentSentence(r),
  createdAt: r.createdAt,
  canEdit: canManageFor(user, { _id: r.owner?._id ?? r.owner, group: r.group?._id ?? r.group }),
});

// true / false from a form; anything else is refused.
function checkFlag(value, label) {
  if (value === true || value === 'true' || value === 1) return true;
  if (value === false || value === 'false' || value === 0 || value === '' || value === null) return false;
  throw badRequest(`${label} must be yes or no`);
}

// The resident's share of the income, in percent (0-100, decimals allowed).
function checkShare(value) {
  if (value === undefined || value === null || value === '') return 0;
  const n = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 100) throw badRequest('Divide % must be between 0 and 100');
  return Math.round(n * 100) / 100;
}

function checkAge(value) {
  if (value === undefined || value === null || value === '') return null;
  const age = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN;
  if (!Number.isInteger(age) || age < 0 || age > 130) throw badRequest('Age must be a whole number between 0 and 130');
  return age;
}

async function checkFields(body, partial = false) {
  const fields = {};
  if (!partial || body.name !== undefined) {
    fields.name = checkText(body.name, 'Name', 80);
    if (!fields.name) throw badRequest('Give the resident a name');
  }
  if (body.photo !== undefined) fields.photo = await checkImage(body.photo);
  if (body.country !== undefined) fields.country = checkText(body.country, 'Country', 60);
  if (body.citizenship !== undefined) fields.citizenship = checkText(body.citizenship, 'Citizenship', 60);
  if (body.age !== undefined) fields.age = checkAge(body.age);
  if (body.source !== undefined) fields.source = checkText(body.source, 'Source', 160);
  if (body.firstContact !== undefined) {
    fields.firstContact = body.firstContact === null || body.firstContact === '' ? null : checkDay(body.firstContact, 'the first contact day');
  }
  if (body.firstContactVia !== undefined) fields.firstContactVia = checkText(body.firstContactVia, 'First contacted via', 60);
  if (body.hasLaptop !== undefined) fields.hasLaptop = checkFlag(body.hasLaptop, 'Has a laptop');
  if (body.laptopSource !== undefined) {
    if (!LAPTOP_SOURCES.includes(body.laptopSource ?? '')) throw badRequest('Laptop source is bought for them or already had one');
    fields.laptopSource = body.laptopSource ?? '';
  }
  if (body.accessSetUp !== undefined) fields.accessSetUp = checkFlag(body.accessSetUp, 'Access set up');
  if (body.accessType !== undefined) {
    if (!ACCESS_TYPES.includes(body.accessType ?? '')) throw badRequest('Access type is laptop, VPS or proxy');
    fields.accessType = body.accessType ?? '';
  }
  if (body.sharePercent !== undefined) fields.sharePercent = checkShare(body.sharePercent);
  if (body.notes !== undefined) fields.notes = checkText(body.notes, 'Notes', 2000);
  return fields;
}

// Members can only add residents for themselves; a boss for their group; the
// leader and admins for anyone.
const resolveOwner = (req, { orSelf = false } = {}) => resolveRecordOwner(req, req.body.owner, {
  orSelf, denied: 'You cannot add residents for that member',
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const populate = (q) => q.populate([{ path: 'owner', select: 'name role' }, { path: 'group', select: 'name slug' }]);

// GET /api/residents?group=all|<slug>&member=<id>&q=text
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
    filter.$or = [{ name: rx }, { country: rx }, { citizenship: rx }, { source: rx }];
  }

  const residents = await populate(Resident.find(filter).sort('name'));

  res.json({
    residents: residents.map((r) => serialize(r, req.user)),
    can: { addForOthers: canReadTeam(req.user), own: ownsRecords(req.user) },
    groups: allowed.map((g) => ({ id: g._id, name: g.name, slug: g.slug })),
    scope: canReadTeam(req.user) ? (req.user.role === 'boss' ? 'group' : 'all') : 'self',
  });
});

// Members this user may add a resident for.
router.get('/owners', async (req, res) => {
  const users = await User.find(assignableFilter(req.user), 'name role group')
    .populate('group', 'name').sort('name').lean();
  res.json({ members: users.map((u) => ({ id: u._id, name: u.name, role: u.role, group: u.group?.name ?? null })) });
});

// POST /api/residents/upload — multipart `images` (one photo); returns the
// reference to send back as the resident's `photo`.
router.post('/upload', uploadLimiter(), imageUpload, (req, res) => {
  const [file] = req.files ?? [];
  if (!file) throw badRequest('Choose a photo');
  res.status(201).json({ photo: describeUpload(file) });
});

router.post('/', async (req, res) => {
  const owner = await resolveOwner(req, { orSelf: true });
  const resident = await new Resident({
    ...await checkFields(req.body),
    owner: owner._id,
    group: owner.group ?? null,
    createdBy: req.user._id,
  }).save();
  await populate(resident);

  residentChanged(resident);
  res.status(201).json({ resident: serialize(resident, req.user) });
});

async function findResident(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Resident not found');
  const resident = await populate(Resident.findById(req.params.id));
  if (!resident) throw notFound('Resident not found');
  // Residents outside this role's scope look like they do not exist.
  const scope = scopeFilter(req.user, 'owner');
  const visible = (!scope.group || String(scope.group) === String(resident.group?._id ?? resident.group))
    && (!scope.owner || String(scope.owner) === String(resident.owner?._id ?? resident.owner));
  if (!visible) throw notFound('Resident not found');
  return resident;
}

const mayManage = (user, r) => canManageFor(user, { _id: r.owner._id, group: r.group?._id ?? r.group });

router.patch('/:id', async (req, res) => {
  const resident = await findResident(req);
  if (!mayManage(req.user, resident)) throw forbidden('You cannot change this resident');
  const before = resident.photo?.file;
  const shareBefore = resident.sharePercent ?? 0;
  Object.assign(resident, await checkFields(req.body, true));
  if (req.body.owner !== undefined) {
    const owner = await resolveOwner(req);
    resident.owner = owner._id;
    resident.group = owner.group ?? null;
  }
  await resident.save();
  await populate(resident);
  if (before && before !== resident.photo?.file) await removeUnusedFiles([before], fileInUse);
  // A new share changes what the unpaid work on their projects is worth.
  if ((resident.sharePercent ?? 0) !== shareBefore) {
    await repriceResident(resident._id);
    taskWorkChanged(resident.owner._id, resident.group?._id ?? null);
  }

  residentChanged(resident);
  res.json({ resident: serialize(resident, req.user) });
});

router.delete('/:id', async (req, res) => {
  const resident = await findResident(req);
  if (!mayManage(req.user, resident)) throw forbidden('You cannot delete this resident');
  await resident.deleteOne();
  // Chat accounts that talked to this resident no longer list them.
  await ChatAccount.updateMany({ contacts: resident._id }, { $pull: { contacts: resident._id } });
  await Task.updateMany({ resident: resident._id }, { resident: null });
  if (resident.photo?.file) await removeUnusedFiles([resident.photo.file], fileInUse);
  residentChanged(resident);
  taskWorkChanged(resident.owner._id, resident.group?._id ?? null);
  res.json({ ok: true });
});

export default router;
