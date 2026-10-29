import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { can } from '../config/roles.js';
import { writeLimit } from './limits.js';
import User from '../models/User.js';
import RevokedToken from '../models/RevokedToken.js';
import { unauthorized, forbidden } from '../utils/httpError.js';

export const TOKEN_COOKIE = 'token';

// Tokens are signed with one algorithm, and only that one is accepted back.
const ALGORITHM = 'HS256';
const VERIFY = { algorithms: [ALGORITHM] };

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProd,
  path: '/',
};

const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 };
// "7d", "12h", "3600" -> seconds.
export function durationSeconds(value) {
  const m = /^\s*(\d+)\s*([smhd]?)\s*$/i.exec(String(value));
  return m ? Number(m[1]) * UNIT_SECONDS[(m[2] || 's').toLowerCase()] : 7 * 86400;
}

// The longest one login may last, from the moment of logging in.
export const maxSessionSeconds = (user) => (['admin', 'leader'].includes(user.role)
  ? env.adminSessionHours * 3600
  : durationSeconds(env.jwtExpiresIn));

// A session is one login. Its token is short-lived: it lasts
// SESSION_IDLE_MINUTES and is renewed while the session is in use (see
// authenticate), but never past the session's maximum length. Every renewal
// keeps the session's id (jti, so logging out ends all of them) and its
// start (st, which password changes and "end sessions" are checked against).
export function signToken(user, session = {}) {
  const now = Math.floor(Date.now() / 1000);
  const st = session.st ?? now;
  const end = Math.min(now + env.sessionIdleMinutes * 60, st + maxSessionSeconds(user));
  return jwt.sign({ sub: String(user._id), role: user.role, st }, env.jwtSecret, {
    algorithm: ALGORITHM,
    expiresIn: Math.max(1, end - now),
    jwtid: session.jti ?? randomUUID(),
  });
}

// Issues a token in the session cookie, for a new login or (with the
// session's jti and st) a renewal. The cookie lives exactly as long as the
// token, so the two never disagree.
export function setSessionCookie(res, user, session) {
  const token = signToken(user, session);
  const { exp } = jwt.decode(token);
  res.cookie(TOKEN_COOKIE, token, { ...cookieOptions, maxAge: exp * 1000 - Date.now() });
}

// Ends the session this request's token belongs to (logout). Returns the
// token's payload so its open sockets can be dropped too.
export async function revokeToken(req) {
  let payload;
  try {
    payload = jwt.verify(readToken(req) ?? '', env.jwtSecret, VERIFY);
  } catch {
    return null; // no valid token: nothing to end
  }
  if (!payload.jti) return payload;
  // A renewal sent at the same moment can outlive this token by a little.
  await RevokedToken.updateOne(
    { _id: payload.jti },
    { expiresAt: new Date((payload.exp + 5 * 60) * 1000) },
    { upsert: true },
  );
  return payload;
}

function readToken(req) {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[TOKEN_COOKIE];
}

// Verifies the token, loads the user and blocks inactive accounts.
// Tokens issued before the last password change are rejected, so changing
// a password logs out every other session.
export async function loadSession(token) {
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, VERIFY);
  } catch {
    throw unauthorized('Session expired, please log in again');
  }
  if (payload.jti && await RevokedToken.exists({ _id: payload.jti })) {
    throw unauthorized('You have logged out, please log in again');
  }
  const user = await User.findById(payload.sub);
  if (!user) throw unauthorized();
  if (user.status !== 'active') throw forbidden('This account is not active');
  // When the login happened, not when its token was last renewed.
  const started = payload.st ?? payload.iat;
  if (user.passwordChangedAt && Math.floor(user.passwordChangedAt / 1000) > started) {
    throw unauthorized('Password was changed, please log in again');
  }
  if (user.sessionsEndedAt && Math.floor(user.sessionsEndedAt / 1000) >= started) {
    throw unauthorized('Your sessions were ended, please log in again');
  }
  return { user, payload };
}

export const loadUserFromToken = async (token) => (await loadSession(token)).user;

// Paths a user can still reach while they are forced to change their password.
const PASSWORD_CHANGE_ALLOWED = new Set(['/api/auth/me', '/api/auth/change-password', '/api/auth/logout']);

// A token is renewed at most once a minute.
const RENEW_AFTER_S = 60;

async function authenticate(req, res, next) {
  const { user, payload } = await loadSession(readToken(req));
  req.user = user;
  // In use: the session's idle clock starts again (Bearer tokens from
  // scripts are left alone; they have no cookie to renew).
  if (!req.get('authorization') && payload.jti && Date.now() / 1000 - payload.iat > RENEW_AFTER_S) {
    setSessionCookie(res, user, { jti: payload.jti, st: payload.st ?? payload.iat });
  }
  if (req.user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(req.originalUrl.split('?')[0])) {
    throw forbidden('You must change your password first');
  }
  next();
}

// Logged in, and not changing things faster than any person would.
export const requireAuth = [authenticate, writeLimit];

export const requireCapability = (capability) => (req, res, next) => {
  if (!can(req.user, capability)) throw forbidden();
  next();
};
