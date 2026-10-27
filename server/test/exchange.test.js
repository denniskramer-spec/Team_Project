import test from 'node:test';
import assert from 'node:assert/strict';
import { toBase, checkCurrency } from '../src/utils/exchange.js';

const rates = { base: 'USD', rates: { USD: 1, EUR: 0.92, GBP: 0.8 }, rateDate: '2026-10-27' };

test('an amount in another currency is recorded in the base at the day\'s rate', () => {
  assert.deepEqual(toBase(92, 'EUR', rates), { amount: 100, currency: 'EUR', originalAmount: 92, rate: 0.92, rateDate: '2026-10-27' });
  assert.deepEqual(toBase('40', 'GBP', rates), { amount: 50, currency: 'GBP', originalAmount: 40, rate: 0.8, rateDate: '2026-10-27' });
  // The base itself is kept as typed, at a rate of 1.
  assert.deepEqual(toBase(12.345, 'USD', rates), { amount: 12.35, currency: 'USD', originalAmount: 12.35, rate: 1, rateDate: '' });
  // A currency with no rate yet is refused rather than taken as 1:1.
  assert.throws(() => toBase(10, 'BRL', rates), /No exchange rate for BRL/);
});

test('the currency must be one of the app\'s; empty means the base', () => {
  assert.equal(checkCurrency(undefined), 'USD');
  assert.equal(checkCurrency(''), 'USD');
  assert.equal(checkCurrency('eur'), 'EUR');
  assert.throws(() => checkCurrency('XYZ'), /Unknown currency/);
  assert.throws(() => checkCurrency(5), /Unknown currency/);
});
