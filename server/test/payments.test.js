import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSplit, checkPayment, workEarnings, priceWork, PAYMENT_METHODS } from '../src/utils/payments.js';

test('the fee comes off first, then the resident share, the rest is net', () => {
  assert.deepEqual(computeSplit({ amount: 150, feePercent: 0, feeFixed: 0, residentPercent: 20 }), { feeAmount: 0, residentAmount: 30, net: 120 });
  assert.deepEqual(computeSplit({ amount: 100, feePercent: 4.49, feeFixed: 0.49, residentPercent: 0 }), { feeAmount: 4.98, residentAmount: 0, net: 95.02 });
  assert.deepEqual(computeSplit({ amount: 100, feePercent: 0, feeFixed: 25, residentPercent: 50 }), { feeAmount: 25, residentAmount: 37.5, net: 37.5 });
  // A fixed fee can never exceed the amount.
  assert.deepEqual(computeSplit({ amount: 10, feePercent: 0, feeFixed: 25 }), { feeAmount: 10, residentAmount: 0, net: 0 });
});

test('the fee always comes from the method\'s current rate, never from the client', () => {
  const table = { paypal: { feePercent: 4.49, feeFixed: 0.49 }, wise: { feePercent: 0.376, feeFixed: 6.11 } };
  const rateFor = (key) => table[key];
  assert.deepEqual(checkPayment({ method: 'paypal' }, rateFor), { method: 'paypal', feePercent: 4.49, feeFixed: 0.49, residentPercent: 0 });
  // A client-sent fee is ignored.
  assert.deepEqual(checkPayment({ method: 'wise', feePercent: '1', feeFixed: '0', residentPercent: '20' }, rateFor), { method: 'wise', feePercent: 0.376, feeFixed: 6.11, residentPercent: 20 });
  // A method with no stored rate yet falls back to its usual fee.
  assert.deepEqual(checkPayment({}, rateFor), { method: 'other', feePercent: 0, feeFixed: 0, residentPercent: 0 });
  assert.throws(() => checkPayment({ method: 'venmo' }, rateFor), /Unknown payment method/);
  assert.throws(() => checkPayment({ method: 'cash', residentPercent: 120 }, rateFor), /100 or less/);
  assert.ok(PAYMENT_METHODS.every((m) => m.key && m.label));
});

test('a day\'s work earns price × hours or price × tasks, less the resident share', () => {
  assert.equal(workEarnings({ price: 30, priceUnit: 'hour', residentPercent: 20 }, { hours: 5 }), 120);
  assert.equal(workEarnings({ price: 65, priceUnit: 'hour', residentPercent: 0 }, { hours: 2.5 }), 162.5);
  assert.equal(workEarnings({ price: 30, priceUnit: 'task', residentPercent: 0 }, { count: 10 }), 300);
  assert.equal(workEarnings({ price: 30, priceUnit: 'task', residentPercent: 20 }, { count: 10, hours: 4 }), 240);
  assert.equal(workEarnings({ price: 3000, priceUnit: 'fixed', residentPercent: 0 }, { hours: 5, count: 5 }), 0);
  assert.equal(workEarnings({ price: 30, priceUnit: 'hour' }, { hours: 0 }), 0);
});

test('work on a project priced in another currency is recorded in the base', () => {
  const rates = { base: 'USD', rates: { USD: 1, EUR: 0.8, BRL: 5 }, rateDate: '2026-10-28' };
  // €50/h × 10 h = €500, which is $625 at 0.8 EUR per USD.
  assert.deepEqual(priceWork({ price: 50, priceUnit: 'hour', currency: 'EUR' }, { hours: 10 }, rates), { amount: 625, currency: 'EUR', rate: 0.8 });
  assert.equal(workEarnings({ price: 50, priceUnit: 'hour', currency: 'EUR' }, { hours: 10 }, rates), 625);
  // The resident's share comes off in the project's currency, before the conversion.
  assert.equal(workEarnings({ price: 100, priceUnit: 'task', currency: 'BRL', residentPercent: 20 }, { count: 3 }, rates), 48);
  // The base itself is untouched; a currency without a rate is refused, not taken as 1:1.
  assert.equal(workEarnings({ price: 30, priceUnit: 'hour', currency: 'USD' }, { hours: 2 }, rates), 60);
  assert.throws(() => workEarnings({ price: 30, priceUnit: 'hour', currency: 'GBP' }, { hours: 2 }, rates), /No exchange rate for GBP/);
  // Nothing to price needs no rate (a text-only work entry on such a project).
  assert.deepEqual(priceWork({ price: 30, priceUnit: 'hour', currency: 'GBP' }, { hours: 0 }, rates), { amount: 0, currency: 'GBP', rate: null });
});
