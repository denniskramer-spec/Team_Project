import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { can } from '../config/roles.js';
import User from '../models/User.js';
import RevokedToken from '../models/RevokedToken.js';
import { unauthorized, forbidden } from '../utils/httpError.js';

export const TOKEN_COOKIE = 'token';

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProd,
  path: '/',
};

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
    jwtid: randomUUID(),
  });
}

// Issues a fresh token in the session cookie. The cookie lives exactly as
// long as the token (JWT_EXPIRES_IN), so the two never disagree.
export function setSessionCookie(res, user) {
  const token = signToken(user);
  const { exp } = jwt.decode(token);
  res.cookie(TOKEN_COOKIE, token, { ...cookieOptions, maxAge: exp * 1000 - Date.now() });
}

// Ends the session this request's token belongs to (logout). Returns the
// token's payload so its open sockets can be dropped too.
export async function revokeToken(req) {
  let payload;
  try {
    payload = jwt.verify(readToken(req) ?? '', env.jwtSecret);
  } catch {
    return null; // no valid token: nothing to end
  }
  if (!payload.jti) return payload;
  await RevokedToken.updateOne(
    { _id: payload.jti },
    { expiresAt: new Date(payload.exp * 1000) },
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
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw unauthorized('Session expired, please log in again');
  }
  if (payload.jti && await RevokedToken.exists({ _id: payload.jti })) {
    throw unauthorized('You have logged out, please log in again');
  }
  const user = await User.findById(payload.sub);
  if (!user) throw unauthorized();
  if (user.status !== 'active') throw forbidden('This account is not active');
  if (user.passwordChangedAt && Math.floor(user.passwordChangedAt / 1000) > payload.iat) {
    throw unauthorized('Password was changed, please log in again');
  }
  return { user, payload };
}

export const loadUserFromToken = async (token) => (await loadSession(token)).user;

// Paths a user can still reach while they are forced to change their password.
const PASSWORD_CHANGE_ALLOWED = new Set(['/api/auth/me', '/api/auth/change-password', '/api/auth/logout']);

export async function requireAuth(req, res, next) {
  req.user = await loadUserFromToken(readToken(req));
  if (req.user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(req.originalUrl.split('?')[0])) {
    throw forbidden('You must change your password first');
  }
  next();
}

export const requireCapability = (capability) => (req, res, next) => {
  if (!can(req.user, capability)) throw forbidden();
  next();
};
