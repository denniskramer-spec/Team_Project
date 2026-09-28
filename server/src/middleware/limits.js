import rateLimit from 'express-rate-limit';

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
