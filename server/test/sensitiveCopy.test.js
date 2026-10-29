import test from 'node:test';
import assert from 'node:assert/strict';
import { sensitiveIn } from '../src/utils/sensitiveCopy.js';

const kinds = (text) => sensitiveIn(text).map((f) => f.kind);

test('a valid IBAN counts, spaced or not, and is masked', () => {
  assert.deepEqual(sensitiveIn('Pay to DE89 3704 0044 0532 0130 00 please'), [{ kind: 'iban', masked: 'DE89••••••••••••••3000' }]);
  assert.deepEqual(kinds('gb29nwbk60161331926819'), ['iban']);
});

test('an IBAN with a wrong check digit does not', () => {
  assert.deepEqual(kinds('DE88 3704 0044 0532 0130 00'), []);
});

test('a card number counts only when it passes Luhn', () => {
  assert.deepEqual(sensitiveIn('card 4111 1111 1111 1111'), [{ kind: 'card', masked: '••••••••••••1111' }]);
  assert.deepEqual(kinds('4111 1111 1111 1112'), []);
});

test('an account number counts when it is labelled as one', () => {
  assert.deepEqual(kinds('Account no: 12345678, sort code 20-00-00'), ['bank-account', 'bank-account']);
  assert.deepEqual(kinds('Order 12345678 shipped'), []);
});

test('wallet addresses count', () => {
  assert.deepEqual(kinds('USDT TRC20: TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7'), ['wallet']);
  assert.deepEqual(kinds('0x52908400098527886E0F7030069857D2E4169EE7'), ['wallet']);
});

test('ordinary text, dates, phone numbers and record ids do not', () => {
  assert.deepEqual(kinds('Meeting on 2026-10-29 at 14:00, call +49 30 123456'), []);
  assert.deepEqual(kinds('6720f1a2b3c4d5e6f7a8b9c0'), []);
  assert.deepEqual(kinds(''), []);
  assert.deepEqual(kinds(null), []);
});
