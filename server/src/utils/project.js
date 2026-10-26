import { badRequest } from './httpError.js';
import { checkOptionalAmount } from './validate.js';
import { PRICE_UNITS, CURRENCIES } from '../models/Task.js';

const SYMBOLS = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$', BRL: 'R$' };
const SUFFIX = { hour: '/hr', task: '/task', day: '/day', week: '/wk', month: '/mo', fixed: '' };

// "$65/hr", "€1,200/mo", "R$500" — how a project's price is shown.
export function formatPrice({ price = 0, currency = 'USD', priceUnit = 'hour' } = {}) {
  const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(price) || 0);
  return `${SYMBOLS[currency] ?? `${currency} `}${amount}${SUFFIX[priceUnit] ?? ''}`;
}

// The price fields from a request body; only the ones given.
export function checkPrice(body) {
  const fields = {};
  if (body.price !== undefined) fields.price = checkOptionalAmount(body.price, 'Price');
  if (body.currency !== undefined) {
    if (!CURRENCIES.includes(body.currency)) throw badRequest(`Currency must be one of ${CURRENCIES.join(', ')}`);
    fields.currency = body.currency;
  }
  if (body.priceUnit !== undefined) {
    if (!PRICE_UNITS.includes(body.priceUnit)) throw badRequest('Price is per hour, per task, day, week, month or fixed');
    fields.priceUnit = body.priceUnit;
  }
  return fields;
}

// The lines of one day's work on a project, one bullet each.
export const workLines = (text) => String(text ?? '').split(/\r?\n/).map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);
