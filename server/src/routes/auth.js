import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Group from '../models/Group.js';
import bcrypt from 'bcryptjs';
import { requireAuth, setSessionCookie, TOKEN_COOKIE, cookieOptions } from '../middleware/auth.js';
import {
  requireFields, checkUsername, checkPassword, checkName, parseBirthday,
} from '../utils/validate.js';
import { badRequest, unauthorized, forbidden, conflict } from '../utils/httpError.js';
import { directoryChanged, navChanged } from '../socket/events.js';

const router = Router();

// Slows down password guessing: 10 failed attempts per 15 minutes per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: 'Too many attempts, please try again in a few minutes' },
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
  navChanged(); // updates the approvals badge for approvers

  res.status(201).json({
    message: 'Account created. You can log in once an admin, team leader or boss approves it.',
  });
});

router.post('/login', authLimiter, async (req, res) => {
  requireFields(req.body, ['username', 'password']);
  const user = await User.findOne({ username: req.body.username.trim().toLowerCase() })
    .select('+passwordHash');

  // Same message and about the same time for an unknown user and a wrong
  // password, so usernames can't be probed.
  const ok = user ? await user.checkPassword(req.body.password) : await bcrypt.compare(req.body.password, DUMMY_HASH);
  if (!user || !ok) {
    throw unauthorized('Wrong username or password');
  }
  if (user.status === 'pending') throw forbidden('Your account is waiting for approval');
  if (user.status === 'disabled') throw forbidden('Your account has been disabled');

  user.lastLoginAt = new Date();
  await user.save();

  setSessionCookie(res, user);
  res.json({ user: await publicUser(user) });
});

router.post('/logout', (req, res) => {
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

router.post('/change-password', requireAuth, async (req, res) => {
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

  // Old tokens are now invalid, so issue a fresh one for this session.
  setSessionCookie(res, user);
  res.json({ message: 'Password changed', user: await publicUser(user) });
});

export default router;
