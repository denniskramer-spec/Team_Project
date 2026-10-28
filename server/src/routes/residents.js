import { Router } from 'express';
import { archiveDeleted } from '../utils/audit.js';
import mongoose from 'mongoose';
import Resident, { LAPTOP_SOURCES, ACCESS_TYPES } from '../models/Resident.js';
import ChatAccount from '../models/ChatAccount.js';
import Task from '../models/Task.js';
import { requireAuth } from '../middleware/auth.js';
import {
  canManageFor, canReadTeam, visibleRecord, narrowScope, assignableMembers, scopeName,
} from '../utils/visibility.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { checkText, checkDay, searchRegex } from '../utils/validate.js';
import { resolveRecordOwner, ownsRecords } from '../utils/recordOwner.js';
import { imageUpload, describeUpload, checkImage, removeUnusedFiles, uploadLimiter } from '../utils/uploads.js';
import { fileInUse } from '../utils/fileRefs.js';
import { residentChanged, taskWorkChanged } from '../socket/events.js';
import { repriceResident, repriceTask } from '../utils/reportWork.js';
import { serializeResident as serialize } from '../utils/residentView.js';

// How a resident is shown lives in utils/residentView.js; routes/members.js
// still imports it from here.
export { serializeResident as serialize, LAPTOP_LABELS, ACCESS_LABELS, residentSentence } from '../utils/residentView.js';

const router = Router();
router.use(requireAuth);

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
    fields.firstContact = body.firstContact === null || body.firstContact === '' ? null : checkDay(body.firstContact, 'the first contact day', { pastOnly: true });
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
const resolveOwner = (req, { orSelf = false } = {}) => resolveRecordOwner(req, req.body.owner, { orSelf });

const populate = (q) => q.populate([{ path: 'owner', select: 'name role' }, { path: 'group', select: 'name slug' }]);

// GET /api/residents?group=all|<slug>&member=<id>&q=text
router.get('/', async (req, res) => {
  const { allowed, filter } = await narrowScope(req, 'owner');
  const rx = searchRegex(req.query.q);
  if (rx) filter.$or = [{ name: rx }, { country: rx }, { citizenship: rx }, { source: rx }];

  const residents = await populate(Resident.find(filter).sort('name'));

  res.json({
    residents: residents.map((r) => serialize(r, req.user)),
    can: { addForOthers: canReadTeam(req.user), own: ownsRecords(req.user) },
    groups: allowed.map((g) => ({ id: g._id, name: g.name, slug: g.slug })),
    scope: scopeName(req.user),
  });
});

// Members this user may add a resident for.
router.get('/owners', async (req, res) => {
  res.json({ members: await assignableMembers(req.user) });
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
  if (!visibleRecord(req.user, resident, 'owner')) throw notFound('Resident not found');
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
  await archiveDeleted(resident, req, { model: 'Resident', label: resident.name });
  await resident.deleteOne();
  // Chat accounts that talked to this resident no longer list them.
  await ChatAccount.updateMany({ contacts: resident._id }, { $pull: { contacts: resident._id } });
  // Their projects go on without them, and the unpaid work on those no
  // longer carries the resident's share.
  const projects = await Task.find({ resident: resident._id }, '_id').lean();
  await Task.updateMany({ resident: resident._id }, { resident: null });
  for (const t of projects) await repriceTask(t._id);
  if (resident.photo?.file) await removeUnusedFiles([resident.photo.file], fileInUse);
  residentChanged(resident);
  taskWorkChanged(resident.owner._id, resident.group?._id ?? null);
  res.json({ ok: true });
});

export default router;
