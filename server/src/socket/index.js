import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { loadUserFromToken, TOKEN_COOKIE } from '../middleware/auth.js';
import { resolveChannel, roomsFor } from '../utils/chatPolicy.js';

// Number of open sockets per user id. A user is online while this is > 0
// (they may have several tabs open).
const connections = new Map();

let io = null;

const TYPING_ACCESS_TTL_MS = 60 * 1000;

export const onlineUserIds = () => [...connections.keys()];

// Lets route handlers push real-time events (instruction alerts, chat, ...).
export const getIO = () => io;

function readCookie(header = '', name) {
  const match = header.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.clientOrigin, credentials: true },
  });

  // Same login rules as the REST API: valid cookie, active account.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || readCookie(socket.handshake.headers.cookie, TOKEN_COOKIE);
      const user = await loadUserFromToken(token);
      if (user.mustChangePassword) return next(new Error('Password change required'));
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

    const wasOnline = connections.has(id);
    connections.set(id, (connections.get(id) || 0) + 1);
    socket.emit('presence:list', onlineUserIds());
    if (!wasOnline) socket.broadcast.emit('presence:online', id);

    // "X is typing" in chat. Only broadcast to chats this user may open.
    // Access is looked up once a minute per chat, not on every keystroke.
    const typingAccess = new Map(); // titleKey -> { channel, at }
    socket.on('chat:typing', async ({ titleKey } = {}) => {
      if (typeof titleKey !== 'string' || titleKey.length > 100) return;
      try {
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
        io.emit('presence:offline', id);
      }
    });
  });

  return io;
}
