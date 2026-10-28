import net from 'node:net';
import rateLimit from 'express-rate-limit';

// The address a per-address limit counts by: an IPv4 address as it is, an
// IPv6 address as its /56 network. One machine can use any address of the
// /64 it is given (and often a few neighbouring ones), so counting each
// address on its own would hand it a fresh allowance every time.
export function ipBucket(ip, bits = 56) {
  if (typeof ip !== 'string' || !net.isIPv6(ip)) return String(ip ?? '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];
  const [head, tail = ''] = ip.split('%')[0].split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t].map((g) => parseInt(g, 16) || 0);
  let left = bits;
  const kept = groups.map((g) => {
    const take = Math.min(16, Math.max(0, left));
    left -= 16;
    return take ? (g >> (16 - take)) << (16 - take) : 0;
  });
  return `${kept.map((g) => g.toString(16)).join(':')}/${bits}`;
}

// Per-person limits on how fast things can be posted. They sit far above
// what anyone does by hand and only stop a script (or a stuck client) from
// flooding everybody's screen. All of them run after requireAuth.
const perUser = ({ windowMs, limit, message, skip }) => rateLimit({
  windowMs,
  limit,
  skip,
  keyGenerator: (req) => String(req.user._id),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message },
});

const reading = (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method);

// Anything that changes data: 120 requests a minute.
export const writeLimit = perUser({
  windowMs: 60 * 1000,
  limit: 120,
  skip: reading,
  message: 'You are doing that too fast, please wait a moment',
});

// Chat: 20 messages in 10 seconds.
export const chatLimit = perUser({
  windowMs: 10 * 1000,
  limit: 20,
  message: 'You are sending messages too fast, please wait a moment',
});

// Instructions reach many people at once: 10 a minute, and 3 urgent ones
// (each of those raises an alarm on every recipient's screen).
export const instructionLimit = perUser({
  windowMs: 60 * 1000,
  limit: 10,
  message: 'Too many instructions at once, please wait a minute',
});
export const urgentLimit = perUser({
  windowMs: 60 * 1000,
  limit: 3,
  skip: (req) => req.body?.priority !== 'urgent',
  message: 'Too many urgent instructions at once, please wait a minute',
});
