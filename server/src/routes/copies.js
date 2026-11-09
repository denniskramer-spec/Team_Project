import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { sensitiveIn } from '../utils/sensitiveCopy.js';

// POST /api/copies { text, page } — the page sends text a member copied or
// cut when it may hold bank details. Only a copy that really does (see
// utils/sensitiveCopy.js) goes in the security log, masked; anything else is
// dropped without a trace (utils/audit.js skips this path otherwise).
const router = Router();

// Nobody copies bank details more than a few times an hour by hand. Each
// one noted here reaches every admin's screen, so a script sending them is
// told to stop (and the refusals are in the security log).
const copyLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => String(req.user._id),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many copies noted, please wait a while' },
});

// The page the copy was made on: one of the app's own paths, nothing else.
const PAGE_PATH = /^\/[a-z0-9/_-]{0,120}$/i;

router.post('/', requireAuth, copyLimit, (req, res) => {
  const { text, page } = req.body;
  const found = sensitiveIn(text);
  if (found.length) {
    const where = typeof page === 'string' && PAGE_PATH.test(page) ? page : '';
    req.audit = {
      action: 'copy.sensitive',
      target: where ? { label: where } : null,
      details: { found, page: where, chars: String(text).length },
      flags: ['sensitive-copy'],
    };
  }
  res.status(204).end();
});

export default router;
