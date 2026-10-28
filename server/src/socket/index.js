import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { dbState } from '../config/db.js';
import { loadSession, TOKEN_COOKIE } from '../middleware/auth.js';
import { resolveChannel, roomsFor } from '../utils/chatPolicy.js';
import User from '../models/User.js';

// Number of open sockets per user id. A user is online while this is > 0
// (they may have several tabs open).
const connections = new Map();

let io = null;

const TYPING_ACCESS_TTL_MS = 60 * 1000;
// The app sends "typing" every 2 seconds; anything faster is not relayed.
const TYPING_RELAY_MS = 1500;
// Open tabs and devices per account. More than this is a script, not a person.
const MAX_SOCKETS_PER_USER = 10;

export const onlineUserIds = () => [...connections.keys()];

// Lets route handlers push real-time events (instruction alerts, chat, ...).
export const getIO = () => io;

// Drops the sockets that were opened with one session's token (logout).
export async function disconnectSession(userId, jti) {
  if (!io || !jti) return;
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  sockets.filter((s) => s.data.jti === jti).forEach((s) => s.disconnect(true));
}

function readCookie(header = '', name) {
  const match = header.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.clientOrigin, credentials: true },
    // The cors option only sets headers; a page on another origin could
    // still open the WebSocket with the cookie. Refuse the handshake unless
    // it comes from the app itself: the configured client origin, the same
    // host the request was sent to (production serves the page itself), or
    // no page at all (a script with a Bearer token).
    allowRequest: (req, cb) => {
      const origin = req.headers.origin;
      let sameHost = false;
      try { sameHost = Boolean(origin) && new URL(origin).host === req.headers.host; } catch { /* not a URL */ }
      cb(null, !origin || origin === env.clientOrigin || sameHost);
    },
  });

  // Same login rules as the REST API: valid cookie, active account. While
  // the database is unreachable the handshake fails at once, like the API's
  // 503, instead of waiting on a lookup that cannot happen.
  io.use(async (socket, next) => {
    if (dbState() !== 'connected') return next(new Error('Database is unavailable, please try again shortly'));
    try {
      const token = socket.handshake.auth?.token || readCookie(socket.handshake.headers.cookie, TOKEN_COOKIE);
      const session = await loadSession(token);
      const { user } = session;
      if (user.mustChangePassword) return next(new Error('Password change required'));
      if ((connections.get(String(user._id)) || 0) >= MAX_SOCKETS_PER_USER) {
        return next(new Error('Too many open connections for this account'));
      }
      socket.data.jti = session.payload.jti ?? null;
      socket.data.user = {
        id: String(user._id),
        name: user.name,
        role: user.role,
        group: user.group ? String(user.group) : null,
      };
      next();
    } catch (err) {
      next(new Error(err.message || 'Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role, group } = socket.data.user;

    // Rooms let later steps target one user, one group or one role.
    socket.join([`user:${id}`, `role:${role}`, 'all']);
    if (group) socket.join(`group:${group}`);

    // The cap was checked before this socket was accepted, and several
    // handshakes at once can all pass it. Connections are handled one at a
    // time here, so this is where it holds; a socket over it never counts.
    const open = (connections.get(id) || 0) + 1;
    if (open > MAX_SOCKETS_PER_USER) {
      socket.disconnect(true);
      return;
    }
    const wasOnline = connections.has(id);
    connections.set(id, open);
    const touch = () => User.updateOne({ _id: id }, { lastSeenAt: new Date() }).catch(() => {});
    touch();
    socket.emit('presence:list', onlineUserIds());
    if (!wasOnline) socket.broadcast.emit('presence:online', id);

    // "X is typing" in chat. Only broadcast to chats this user may open.
    // Access is looked up once a minute per chat, not on every keystroke.
    // Whatever a client sends must never take the server down: the payload is
    // read inside the try, not destructured in the parameter list.
    const typingAccess = new Map(); // titleKey -> { channel, at }
    let lastTypingAt = 0;
    socket.on('chat:typing', async (payload) => {
      try {
        const titleKey = payload?.titleKey;
        if (typeof titleKey !== 'string' || titleKey.length > 100) return;
        if (Date.now() - lastTypingAt < TYPING_RELAY_MS) return;
        lastTypingAt = Date.now();
        let cached = typingAccess.get(titleKey);
        if (!cached || Date.now() - cached.at > TYPING_ACCESS_TTL_MS) {
          cached = { channel: await resolveChannel({ _id: id, role, group }, titleKey), at: Date.now() };
          typingAccess.set(titleKey, cached);
        }
        const { channel } = cached;
        socket.to(roomsFor(channel)).emit('chat:typing', {
          titleKey,
          user: { id, name: socket.data.user.name },
        });
      } catch {
        /* no access to that chat: ignore */
      }
    });

    socket.on('disconnect', () => {
      const left = (connections.get(id) || 1) - 1;
      if (left > 0) {
        connections.set(id, left);
      } else {
        connections.delete(id);
        touch();
        io.emit('presence:offline', id);
      }
    });
  });

  return io;
}
