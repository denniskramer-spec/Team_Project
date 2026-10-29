import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { writeLimit } from '../middleware/limits.js';
import { sensitiveIn } from '../utils/sensitiveCopy.js';

// POST /api/copies { text, page } — the page sends text a member copied or
// cut when it may hold bank details. Only a copy that really does (see
// utils/sensitiveCopy.js) goes in the security log, masked; anything else is
// dropped without a trace (utils/audit.js skips this path otherwise).
const router = Router();

router.post('/', requireAuth, writeLimit, (req, res) => {
  const { text, page } = req.body;
  const found = sensitiveIn(text);
  if (found.length) {
    const where = typeof page === 'string' ? page.slice(0, 200) : '';
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
