import { Router } from 'express';
import { archiveDeleted } from '../utils/audit.js';
import mongoose from 'mongoose';
import ChatAccount, { STATUSES } from '../models/ChatAccount.js';
import Resident from '../models/Resident.js';
import User from '../models/User.js';
import Group from '../models/Group.js';
import { requireAuth } from '../middleware/auth.js';
import { scopeFilter, canManageFor, canReadTeam, assignableFilter, canSeeMember } from '../utils/visibility.js';
import { visibleGroups } from '../utils/scope.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { checkDay } from '../utils/validate.js';
import { checkPlatform, checkAccountName, checkPhone, PLATFORM_NAMES } from '../utils/chatAccount.js';
import { resolveRecordOwner, ownsRecords } from '../utils/recordOwner.js';
import { imageUpload, describeUpload, checkImage, removeUnusedFiles, uploadLimiter } from '../utils/uploads.js';
import { fileInUse, imageUrl } from '../utils/fileRefs.js';
import { chatAccountChanged } from '../socket/events.js';

// Chat accounts: the Discord, Telegram and WhatsApp accounts members use and
// the residents they talk to from them. Same role rules as residents.
const router = Router();
router.use(requireAuth);

const contact = (r) => ({ id: r._id, name: r.name, photo: imageUrl(r.photo) });

const serialize = (a, user) => ({
  id: a._id,
  platform: a.platform,
  platformName: PLATFORM_NAMES[a.platform],
  name: a.name,
  phone: a.phone,
  joinedAt: a.joinedAt,
  contacts: (a.contacts ?? []).filter((r) => r?._id).map(contact),
  status: a.status,
  screenshot: imageUrl(a.screenshot),
  owner: a.owner?._id ? { id: a.owner._id, name: a.owner.name, role: a.owner.role } : null,
  group: a.group?._id ? { id: a.group._id, name: a.group.name, slug: a.group.slug } : null,
  createdAt: a.createdAt,
  canEdit: canManageFor(user, { _id: a.owner?._id ?? a.owner, group: a.group?._id ?? a.group }),
});

// The residents this user may link to an account: the ones they can see.
const contactFilter = (user) => scopeFilter(user, 'owner');

async function checkContacts(user, list) {
  if (!Array.isArray(list)) throw badRequest('Contacts must be a list');
  const ids = [...new Set(list.map(String))];
  if (ids.some((id) => !mongoose.isValidObjectId(id))) throw badRequest('Unknown resident');
  if (!ids.length) return [];
  const found = await Resident.find({ ...contactFilter(user), _id: { $in: ids } }, '_id').lean();
  if (found.length !== ids.length) throw badRequest('Unknown resident');
  return ids;
}

async function checkFields(req, current = null) {
  const { body } = req;
  const fields = {};
  const platform = body.platform !== undefined || !current ? checkPlatform(body.platform) : current.platform;
  if (body.platform !== undefined || !current) fields.platform = platform;
  // A changed platform re-checks the name against the new platform's rules.
  if (body.name !== undefined || !current || fields.platform) fields.name = checkAccountName(platform, body.name ?? current?.name);
  if (body.phone !== undefined) fields.phone = platform === 'telegram' ? checkPhone(body.phone) : '';
  else if (fields.platform && platform !== 'telegram') fields.phone = '';
  if (body.joinedAt !== undefined) {
    fields.joinedAt = body.joinedAt === null || body.joinedAt === '' ? null : checkDay(body.joinedAt, 'the joined date');
  }
  if (body.contacts !== undefined) fields.contacts = await checkContacts(req.user, body.contacts);
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw badRequest('Status is active or suspended');
    fields.status = body.status;
  }
  if (body.screenshot !== undefined) fields.screenshot = await checkImage(body.screenshot);
  return fields;
}

const resolveOwner = (req, { orSelf = false } = {}) => resolveRecordOwner(req, req.body.owner, {
  orSelf, denied: 'You cannot add chat accounts for that member',
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const populate = (q) => q.populate([
  { path: 'owner', select: 'name role' }, { path: 'group', select: 'name slug' }, { path: 'contacts', select: 'name photo' },
]);

// GET /api/chat-accounts?group=all|<slug>&member=<id>&q=text
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
    filter.$or = [{ name: rx }, { phone: rx }];
  }

  const accounts = await populate(ChatAccount.find(filter).sort({ platform: 1, name: 1 }));

  res.json({
    accounts: accounts.map((a) => serialize(a, req.user)),
    platforms: Object.entries(PLATFORM_NAMES).map(([key, name]) => ({ key, name })),
    can: { addForOthers: canReadTeam(req.user), own: ownsRecords(req.user) },
    groups: allowed.map((g) => ({ id: g._id, name: g.name, slug: g.slug })),
    scope: canReadTeam(req.user) ? (req.user.role === 'boss' ? 'group' : 'all') : 'self',
  });
});

// Members this user may add an account for.
router.get('/owners', async (req, res) => {
  const users = await User.find(assignableFilter(req.user), 'name role group')
    .populate('group', 'name').sort('name').lean();
  res.json({ members: users.map((u) => ({ id: u._id, name: u.name, role: u.role, group: u.group?.name ?? null })) });
});

// Residents this user may link as contacts.
router.get('/contacts', async (req, res) => {
  const residents = await Resident.find(contactFilter(req.user), 'name photo owner').sort('name').lean();
  res.json({ residents: residents.map(contact) });
});

// POST /api/chat-accounts/upload — multipart `images` (one screenshot);
// returns the reference to send back as the account's `screenshot`.
router.post('/upload', uploadLimiter(), imageUpload, (req, res) => {
  const [file] = req.files ?? [];
  if (!file) throw badRequest('Choose a screenshot');
  res.status(201).json({ screenshot: describeUpload(file) });
});

router.post('/', async (req, res) => {
  const owner = await resolveOwner(req, { orSelf: true });
  const account = await new ChatAccount({
    ...await checkFields(req),
    owner: owner._id,
    group: owner.group ?? null,
    createdBy: req.user._id,
  }).save();
  await populate(account);

  chatAccountChanged(account);
  res.status(201).json({ account: serialize(account, req.user) });
});

async function findAccount(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Chat account not found');
  const account = await populate(ChatAccount.findById(req.params.id));
  if (!account) throw notFound('Chat account not found');
  // Accounts outside this role's scope look like they do not exist.
  const scope = scopeFilter(req.user, 'owner');
  const visible = (!scope.group || String(scope.group) === String(account.group?._id ?? account.group))
    && (!scope.owner || String(scope.owner) === String(account.owner?._id ?? account.owner));
  if (!visible) throw notFound('Chat account not found');
  return account;
}

const mayManage = (user, a) => canManageFor(user, { _id: a.owner._id, group: a.group?._id ?? a.group });

router.patch('/:id', async (req, res) => {
  const account = await findAccount(req);
  if (!mayManage(req.user, account)) throw forbidden('You cannot change this chat account');
  const before = account.screenshot?.file;
  Object.assign(account, await checkFields(req, account));
  if (req.body.owner !== undefined) {
    const owner = await resolveOwner(req);
    account.owner = owner._id;
    account.group = owner.group ?? null;
  }
  await account.save();
  await populate(account);
  if (before && before !== account.screenshot?.file) await removeUnusedFiles([before], fileInUse);

  chatAccountChanged(account);
  res.json({ account: serialize(account, req.user) });
});

router.delete('/:id', async (req, res) => {
  const account = await findAccount(req);
  if (!mayManage(req.user, account)) throw forbidden('You cannot delete this chat account');
  await archiveDeleted(account, req, { model: 'ChatAccount', label: `${account.platform ?? ''} ${account.name}`.trim() });
  await account.deleteOne();
  if (account.screenshot?.file) await removeUnusedFiles([account.screenshot.file], fileInUse);
  chatAccountChanged(account);
  res.json({ ok: true });
});

export default router;
