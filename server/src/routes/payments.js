import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { checkOptionalAmount } from '../utils/validate.js';
import { currentMethods, methodOf, setFee } from '../utils/payments.js';
import { refreshFees } from '../utils/feeRefresh.js';
import { feesChanged } from '../socket/events.js';

// Payment methods and their current fees. Everyone reads them; admins and
// the team leader set the ones no public source publishes, and can run the
// daily refresh by hand.
const router = Router();
router.use(requireAuth);

const canManage = (user) => ['admin', 'leader'].includes(user.role);

router.get('/fees', (req, res) => {
  res.json({ methods: currentMethods(), canManage: canManage(req.user) });
});

router.patch('/fees/:key', async (req, res) => {
  if (!canManage(req.user)) throw forbidden('Only admins and the team leader set payment fees');
  const method = methodOf(req.params.key);
  if (!method) throw notFound('Unknown payment method');
  if (method.auto) throw badRequest(`${method.label} is refreshed automatically every day`);
  const feePercent = checkOptionalAmount(req.body.feePercent, 'Fee %');
  if (feePercent > 100) throw badRequest('Fee % must be 100 or less');
  const feeFixed = checkOptionalAmount(req.body.feeFixed, 'Fixed fee');
  await setFee(method.key, { feePercent, feeFixed, source: 'manual', detail: `Set by ${req.user.name}` });
  feesChanged();
  res.json({ methods: currentMethods() });
});

// Each refresh asks several outside services: twice a minute per person,
// like the exchange-rate refresh.
const refreshLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 2, keyGenerator: (req) => String(req.user._id), standardHeaders: 'draft-7', legacyHeaders: false,
  message: { message: 'Fees were just refreshed, please wait a minute' },
});

router.post('/fees/refresh', refreshLimiter, async (req, res) => {
  if (!canManage(req.user)) throw forbidden('Only admins and the team leader refresh payment fees');
  const results = await refreshFees();
  res.json({ results, methods: currentMethods() });
});

export default router;
