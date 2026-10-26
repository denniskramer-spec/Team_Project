import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Report from '../models/Report.js';
import Task from '../models/Task.js';
import Message from '../models/Message.js';
import ChatRead from '../models/ChatRead.js';
import { requireAuth } from '../middleware/auth.js';
import { canSeeMember, canReadTeam, scopeFilter } from '../utils/visibility.js';
import { periodKey } from '../utils/period.js';
import { dmKey } from '../utils/chatPolicy.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { dmEvent } from '../socket/events.js';

const router = Router();
router.use(requireAuth);

const USER_FIELDS = 'name username memberId role group birthday lastSeenAt';

// Lightweight list of active members, used by the right-hand member panel.
router.get('/directory', async (req, res) => {
  const users = await User.find({ status: 'active' }, USER_FIELDS).populate('group', 'name slug').sort('name').lean();
  res.json({
    users: users.map((u) => ({
      id: u._id,
      name: u.name,
      username: u.username,
      memberId: u.memberId,
      role: u.role,
      group: u.group ? { id: u.group._id, name: u.group.name, slug: u.group.slug } : null,
      lastSeenAt: u.lastSeenAt ?? null,
    })),
  });
});

// Days from today to the next occurrence of a yearly date (0 = today).
function daysUntil(date) {
  if (!date) return null;
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (next < today) next.setUTCFullYear(next.getUTCFullYear() + 1);
  return Math.round((next - today) / 86400000);
}

// GET /api/users/upcoming — birthdays in the next two weeks (everyone) and
// project expiries in the next two weeks (within this role's scope).
router.get('/upcoming', async (req, res) => {
  const users = await User.find({ status: 'active', birthday: { $ne: null } }, 'name role birthday').lean();
  const birthdays = users
    .map((u) => ({ id: u._id, name: u.name, role: u.role, inDays: daysUntil(u.birthday) }))
    .filter((b) => b.inDays !== null && b.inDays <= 14)
    .sort((a, b) => a.inDays - b.inDays);
  const soon = new Date(); soon.setUTCDate(soon.getUTCDate() + 14);
  const tasks = await Task.find({ ...scopeFilter(req.user, 'owner'), status: 'active', endDate: { $ne: null, $lte: soon } }, 'name endDate owner')
    .populate('owner', 'name').sort('endDate').lean();
  const expiries = tasks.map((t) => ({
    id: t._id, name: t.name, owner: t.owner?.name ?? null,
    inDays: Math.ceil((new Date(t.endDate) - new Date()) / 86400000),
  }));
  res.json({ birthdays, expiries });
});

// GET /api/users/:id/peek — one member at a glance. Everyone sees the
// basics; the day's report and projects follow the usual scope rules.
router.get('/:id/peek', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Member not found');
  const member = await User.findOne({ _id: req.params.id, status: 'active' }, USER_FIELDS).populate('group', 'name slug').lean();
  if (!member) throw notFound('Member not found');
  const base = {
    id: member._id, name: member.name, username: member.username, memberId: member.memberId, role: member.role,
    group: member.group ? { id: member.group._id, name: member.group.name } : null,
    birthday: member.birthday ?? null, birthdayInDays: daysUntil(member.birthday), lastSeenAt: member.lastSeenAt ?? null,
    canSeeWork: canSeeMember(req.user, member) && ['member', 'boss'].includes(member.role),
  };
  if (!base.canSeeWork) return res.json({ member: base });

  const today = periodKey('daily');
  const [report, projects] = await Promise.all([
    Report.findOne({ author: member._id, scope: 'personal', type: 'daily', period: today }, 'sentAt updatedAt work calls jobBid todayPlan').lean(),
    Task.find({ owner: member._id, status: 'active' }, 'name priceUnit').sort('name').lean(),
  ]);
  const work = new Map((report?.work ?? []).map((w) => [String(w.task), w]));
  res.json({
    member: {
      ...base,
      today: {
        state: report?.sentAt ? 'sent' : report ? 'draft' : 'missing',
        sentAt: report?.sentAt ?? null,
        updatedAt: report?.updatedAt ?? null,
        applied: report?.jobBid ?? 0,
        calls: report?.calls?.length ?? 0,
        planDone: (report?.todayPlan ?? []).filter((p) => p.done).length,
        planTotal: report?.todayPlan?.length ?? 0,
        hours: (report?.work ?? []).reduce((n, w) => n + (w.hours || 0), 0),
      },
      projects: projects.map((t) => {
        const w = work.get(String(t._id));
        return { id: t._id, name: t.name, written: Boolean(w?.text?.trim()), hours: w?.hours ?? 0, count: w?.count ?? 0 };
      }),
    },
  });
});

// POST /api/users/:id/nudge — a manager sends a member a direct message
// reminding them that today's report is due.
router.post('/:id/nudge', async (req, res) => {
  if (!canReadTeam(req.user)) throw forbidden('Only bosses, the leader and admins send reminders');
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Member not found');
  const member = await User.findOne({ _id: req.params.id, status: 'active' }, 'name role group').lean();
  if (!member || !canSeeMember(req.user, member)) throw notFound('Member not found');
  if (String(member._id) === String(req.user._id)) throw badRequest('That is you');
  const content = typeof req.body.message === 'string' && req.body.message.trim()
    ? req.body.message.trim().slice(0, 500)
    : "Reminder: today's daily report is still due. Please send it when you can.";
  const key = dmKey(req.user._id, member._id);
  const message = await new Message({ channelKey: key, author: req.user._id, peers: [req.user._id, member._id], content }).save();
  await ChatRead.findOneAndUpdate({ user: req.user._id, channelKey: key }, { lastReadAt: message.createdAt }, { upsert: true });
  const payload = (titleKey, channelName) => ({
    titleKey, channelName, dm: true,
    message: { id: message._id, author: { id: req.user._id, name: req.user.name, role: req.user.role }, content, createdAt: message.createdAt, editedAt: null },
  });
  dmEvent('chat:new', String(member._id), payload(`dm-${req.user._id}`, req.user.name));
  dmEvent('chat:new', String(req.user._id), payload(`dm-${member._id}`, member.name));
  res.status(201).json({ ok: true });
});

export default router;
