import { badRequest } from './httpError.js';
import { checkOptionalAmount } from './validate.js';
import PaymentFee from '../models/PaymentFee.js';
import { currentRates, toBase } from './exchange.js';

// Ways income arrives. Each starts with a usual fee (percent of the amount +
// a fixed part, in the amount's currency). The ones marked `auto` are
// refreshed every day from public sources (see feeRefresh.js); the others
// follow the provider's published pricing and are kept by an admin.
//
// Starting points (checked October 2026):
//   PayPal   goods & services, international: 2.99% + 1.5% + 0.49 fixed
//   Payoneer receiving is often free; a bank withdrawal is around 1-1.5%
//   Wise     a live quote: ~0.4-0.75% conversion + a fixed pay-in fee
//   USDT     Tron (TRC-20) network cost, from the live TRX price
//   Bitcoin  the live network fee for a normal-size transaction
//   Upwork   10% service fee on earnings
//   Wire     an incoming SWIFT wire usually costs a flat 15-30
export const PAYMENT_METHODS = [
  { key: 'paypal', label: 'PayPal', feePercent: 4.49, feeFixed: 0.49, detail: 'PayPal goods & services, international: 2.99% + 1.5% + 0.49' },
  { key: 'payoneer', label: 'Payoneer', feePercent: 1.5, feeFixed: 0, detail: 'Payoneer withdrawal to a bank, typical' },
  { key: 'wise', label: 'Wise', feePercent: 0.6, feeFixed: 0, auto: true, detail: 'Wise quote, refreshed daily' },
  { key: 'usdt', label: 'Crypto · USDT (TRC-20)', feePercent: 0, feeFixed: 1, auto: true, detail: 'Tron network cost, refreshed daily' },
  { key: 'btc', label: 'Crypto · Bitcoin', feePercent: 0, feeFixed: 3, auto: true, detail: 'Bitcoin network fee, refreshed daily' },
  { key: 'upwork', label: 'Upwork', feePercent: 10, feeFixed: 0, detail: 'Upwork service fee' },
  { key: 'wire', label: 'Bank wire (SWIFT)', feePercent: 0, feeFixed: 25, detail: 'Incoming SWIFT wire, typical' },
  { key: 'bank', label: 'Local bank transfer', feePercent: 0, feeFixed: 0, detail: '' },
  { key: 'cash', label: 'Cash', feePercent: 0, feeFixed: 0, detail: '' },
  { key: 'other', label: 'Other', feePercent: 0, feeFixed: 0, detail: '' },
];

export const methodOf = (key) => PAYMENT_METHODS.find((m) => m.key === key);

// The current rates, kept in memory; loadFees() fills them from the
// database (seeding the defaults the first time) and updates keep them fresh.
const rates = new Map();

export async function loadFees() {
  for (const m of PAYMENT_METHODS) {
    const doc = await PaymentFee.findOneAndUpdate(
      { key: m.key },
      { $setOnInsert: { feePercent: m.feePercent, feeFixed: m.feeFixed, source: m.auto ? 'auto' : 'manual', detail: m.detail } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    rates.set(m.key, doc);
  }
}

export const rateOf = (key) => rates.get(key) ?? methodOf(key);

// Every method with its current fee, for forms and the admin page.
export const currentMethods = () => PAYMENT_METHODS.map((m) => {
  const r = rates.get(m.key);
  return {
    key: m.key, label: m.label, auto: Boolean(m.auto),
    feePercent: r?.feePercent ?? m.feePercent, feeFixed: r?.feeFixed ?? m.feeFixed,
    source: r?.source ?? (m.auto ? 'auto' : 'manual'), detail: r?.detail ?? m.detail,
    updatedAt: r?.updatedAt ?? null, checkedAt: r?.checkedAt ?? null,
  };
});

// Stores a new rate for one method and keeps the memory copy in step.
export async function setFee(key, { feePercent, feeFixed, source, detail, checkedAt }) {
  const update = { feePercent, feeFixed, source };
  if (detail !== undefined) update.detail = detail;
  if (checkedAt !== undefined) update.checkedAt = checkedAt;
  const doc = await PaymentFee.findOneAndUpdate({ key }, update, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
  rates.set(key, doc);
  return doc;
}

const money = (n) => Math.round(n * 100) / 100;

// How an amount splits: the payment fee comes off first, then the resident's
// share is taken from what is left, and the rest is the member's net.
export function computeSplit({ amount, feePercent = 0, feeFixed = 0, residentPercent = 0 }) {
  const gross = Number(amount) || 0;
  const feeAmount = money(Math.min(gross, gross * (feePercent / 100) + feeFixed));
  const afterFee = money(gross - feeAmount);
  const residentAmount = money(afterFee * (residentPercent / 100));
  return { feeAmount, residentAmount, net: money(afterFee - residentAmount) };
}

// The payment fields from a request body: the method and the resident's
// share. The fee is never taken from the client: it is the method's current
// rate (`rateFor` lets tests pass their own table).
export function checkPayment(body, rateFor = rateOf) {
  const method = body.method === undefined || body.method === null || body.method === '' ? 'other' : body.method;
  if (!methodOf(method)) throw badRequest('Unknown payment method');
  const rate = rateFor(method) ?? methodOf(method);
  const residentPercent = checkOptionalAmount(body.residentPercent, 'Resident share %');
  if (residentPercent > 100) throw badRequest('Resident share % must be 100 or less');
  return { method, feePercent: rate.feePercent ?? 0, feeFixed: rate.feeFixed ?? 0, residentPercent };
}

// What a day's work on a project is worth to the member, after the
// resident's share: price × hours on an hourly project, price × tasks done
// on a per-task one, less the share. Other price units (per month, fixed...)
// cannot be worked out from a day's work, so they give 0. A project priced
// in another currency is converted to the base at today's rate, the same
// way an income record is, so reports, Finance and Checkout add up in one
// currency (no rate yet for that currency is an error, not a silent 1:1).
//   { amount, currency, rate }   amount in the base; rate = currency per base unit
export function priceWork({ price = 0, priceUnit = 'hour', residentPercent = 0, currency } = {}, { hours = 0, count = 0 } = {}, rates = currentRates()) {
  const units = priceUnit === 'hour' ? hours : priceUnit === 'task' ? count : 0;
  const code = currency || rates.base;
  const rate = code === rates.base ? 1 : Number(rates.rates?.[code]) || null;
  if (!(units > 0) || !(price > 0)) return { amount: 0, currency: code, rate };
  const earned = money(price * units * (1 - (residentPercent || 0) / 100));
  return { amount: toBase(earned, code, rates).amount, currency: code, rate };
}

// Just the base amount of priceWork().
export const workEarnings = (task, work, rates) => priceWork(task, work, rates).amount;
