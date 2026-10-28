import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Group from '../models/Group.js';
import bcrypt from 'bcryptjs';
import {
  requireAuth, revokeToken, setSessionCookie, TOKEN_COOKIE, cookieOptions,
} from '../middleware/auth.js';
import { ipBucket } from '../middleware/limits.js';
import {
  requireFields, checkUsername, checkPassword, checkName, parseBirthday,
} from '../utils/validate.js';
import { badRequest, unauthorized, forbidden, conflict } from '../utils/httpError.js';
import { approvalsChanged, directoryChanged, sessionChanged } from '../socket/events.js';
import { disconnectSession } from '../socket/index.js';
import AuditLog from '../models/AuditLog.js';
import { clientIp } from '../utils/audit.js';

const router = Router();

const typedUsername = (req) => String(req.body?.username ?? '').trim().toLowerCase().slice(0, 30);

// Has this address logged into this account before? The security log keeps
// every login with its address.
const knownDevice = async (username, ip) => Boolean(username && ip
  && await AuditLog.exists({ action: 'auth.login', ip, $or: [{ 'user.username': username }, { 'details.username': username }] }));

// Slows down password guessing: 10 failed attempts per 15 minutes for one
// username from one IP, so a colleague's typos (or an attack on one account)
// don't lock out everyone else behind the same office router.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `${ipBucket(req.ip)}|${typedUsername(req)}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: 'Too many attempts, please try again in a few minutes' },
});

// One account from many addresses: 30 failed attempts per 15 minutes in
// all, wherever they come from. Twenty bad logins a day by hand would have
// to all land in one quarter of an hour to notice it. A device that has
// logged into the account before is not the one guessing: it keeps its own
// tries while the account is locked, so a stranger cannot lock the owner out.
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `account|${typedUsername(req)}`,
  skip: (req) => knownDevice(typedUsername(req), clientIp(req)),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: 'Too many attempts on this account, please try again in a few minutes' },
});

// Behind it, a wider limit per IP stops one machine trying many usernames.
const ipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  keyGenerator: (req) => ipBucket(req.ip),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: 'Too many attempts from this network, please try again in a few minutes' },
});

// Compared against when the username does not exist (hash of a random string).
const DUMMY_HASH = bcrypt.hashSync(Math.random().toString(36), 12);

async function publicUser(user) {
  await user.populate('group', 'name slug');
  return user.toPublic();
}

// Sign-ups are limited whether they succeed or not, so a script cannot flood
// the approvals queue: 5 new accounts per hour per IP.
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => ipBucket(req.ip),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many sign-ups from this network, please try again later' },
});

// New accounts start as "pending" members until an admin, leader or boss approves them.
router.post('/signup', signupLimiter, async (req, res) => {
  requireFields(req.body, ['username', 'name', 'password']);
  const username = checkUsername(req.body.username);
  const name = checkName(req.body.name);
  const password = checkPassword(req.body.password);
  const birthday = parseBirthday(req.body.birthday);

  let group = null;
  if (req.body.group) {
    if (!mongoose.isValidObjectId(req.body.group) || !(await Group.exists({ _id: req.body.group }))) {
      throw badRequest('Unknown group');
    }
    group = req.body.group;
  }

  if (await User.exists({ username })) throw conflict('That username is already taken');

  const user = new User({ username, name, birthday, group, role: 'member', status: 'pending' });
  await user.setPassword(password);
  await user.save();
  approvalsChanged(); // updates the approvals badge for approvers

  res.status(201).json({
    message: 'Account created. You can log in once an admin, team leader or boss approves it.',
  });
});

router.post('/login', ipLimiter, authLimiter, accountLimiter, async (req, res) => {
  requireFields(req.body, ['username', 'password']);
  const user = await User.findOne({ username: req.body.username.trim().toLowerCase() })
    .select('+passwordHash');

  // Same message and about the same time for an unknown user and a wrong
  // password, so usernames can't be probed.
  const ok = user ? await user.checkPassword(req.body.password) : await bcrypt.compare(req.body.password, DUMMY_HASH);
  const username = String(req.body.username).trim().toLowerCase().slice(0, 60);
  if (!user || !ok) {
    // The failed attempt goes in the security log with the name tried, so a
    // guessing run (many names, or one name many times) shows up there.
    req.audit = { action: 'auth.login.failed', username, details: { reason: user ? 'wrong password' : 'unknown username' } };
    throw unauthorized('Wrong username or password');
  }
  if (user.status === 'pending') {
    req.audit = { action: 'auth.login.failed', username, details: { reason: 'pending approval' } };
    throw forbidden('Your account is waiting for approval');
  }
  if (user.status === 'disabled') {
    req.audit = { action: 'auth.login.failed', username, details: { reason: 'account disabled' } };
    throw forbidden('Your account has been disabled');
  }

  // A login from an address this account has never used before is flagged.
  const ip = clientIp(req);
  const flags = [];
  if (user.lastLoginAt && !(await AuditLog.exists({ 'user.id': user._id, action: 'auth.login', ip }))) flags.push('new-ip');
  req.audit = { action: 'auth.login', details: { username }, flags };

  user.lastLoginAt = new Date();
  await user.save();

  setSessionCookie(res, user);
  // The log entry names who logged in, even though the request started out anonymous.
  req.user = user;
  res.json({ user: await publicUser(user) });
});

router.post('/logout', async (req, res) => {
  const ended = await revokeToken(req);
  if (ended) {
    await disconnectSession(ended.sub, ended.jti);
    req.user = await User.findById(ended.sub, 'name username role').lean();
  }
  req.audit = { action: 'auth.logout', details: null };
  res.clearCookie(TOKEN_COOKIE, cookieOptions);
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await publicUser(req.user) });
});

// Users can edit their own name and birthday.
router.patch('/profile', requireAuth, async (req, res) => {
  if (req.body.name !== undefined) {
    requireFields(req.body, ['name']);
    req.user.name = checkName(req.body.name);
  }
  if (req.body.birthday !== undefined) req.user.birthday = parseBirthday(req.body.birthday);
  await req.user.save();
  directoryChanged();
  res.json({ user: await publicUser(req.user) });
});

// Each check costs a bcrypt hash: a handful of tries a quarter of an hour
// is plenty for a person and nothing for a script to lean on.
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  keyGenerator: (req) => String(req.user._id),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many password attempts, please try again in a few minutes' },
});

router.post('/change-password', requireAuth, passwordLimiter, async (req, res) => {
  requireFields(req.body, ['currentPassword', 'newPassword']);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await user.checkPassword(req.body.currentPassword))) {
    throw badRequest('Current password is incorrect');
  }
  const newPassword = checkPassword(req.body.newPassword);
  if (req.body.currentPassword === newPassword) {
    throw badRequest('New password must be different from the current one');
  }

  await user.setPassword(newPassword);
  user.mustChangePassword = false;
  await user.save();
  req.audit = { action: 'auth.password', details: null };

  // Old tokens are now invalid, so issue a fresh one for this session, and
  // drop every open socket: this session reconnects with the new cookie, the
  // others find their session gone. That waits until the new cookie has
  // reached the browser, or this session would reconnect with the old one.
  setSessionCookie(res, user);
  res.on('finish', () => setTimeout(() => sessionChanged(String(user._id), { disconnect: true }), 1000));
  res.json({ message: 'Password changed', user: await publicUser(user) });
});

export default router;
