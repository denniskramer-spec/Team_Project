import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice, checkPrice, workLines } from '../src/utils/project.js';

test('prices read like "$65/hr"', () => {
  assert.equal(formatPrice({ price: 65, currency: 'USD', priceUnit: 'hour' }), '$65/hr');
  assert.equal(formatPrice({ price: 1200.5, currency: 'EUR', priceUnit: 'month' }), '€1,200.5/mo');
  assert.equal(formatPrice({ price: 500, currency: 'BRL', priceUnit: 'fixed' }), 'R$500');
  assert.equal(formatPrice({}), '$0/hr');
});

test('price fields are checked one by one', () => {
  assert.deepEqual(checkPrice({}), {});
  assert.deepEqual(checkPrice({ price: '30', currency: 'GBP', priceUnit: 'day' }), { price: 30, currency: 'GBP', priceUnit: 'day' });
  assert.deepEqual(checkPrice({ price: '' }), { price: 0 });
  assert.throws(() => checkPrice({ currency: 'XYZ' }), /Currency/);
  assert.throws(() => checkPrice({ priceUnit: 'year' }), /per hour/);
  assert.throws(() => checkPrice({ price: -1 }), /0 or more/);
});

test('work text becomes one bullet per line', () => {
  assert.deepEqual(workLines('Make Criminal Check Certificate\n- Redo Checkr\n\n  • Pending  '), ['Make Criminal Check Certificate', 'Redo Checkr', 'Pending']);
  assert.deepEqual(workLines(''), []);
  assert.deepEqual(workLines(undefined), []);
});
