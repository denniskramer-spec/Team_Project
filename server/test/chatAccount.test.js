import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAccountName, checkPhone, checkPlatform } from '../src/utils/chatAccount.js';

test('only the three platforms are accepted', () => {
  for (const p of ['discord', 'telegram', 'whatsapp']) assert.equal(checkPlatform(p), p);
  for (const bad of ['signal', 'Discord', '', undefined, null, 3]) assert.throws(() => checkPlatform(bad), /Discord, Telegram or WhatsApp/);
});

test('a Discord account is any name', () => {
  assert.equal(checkAccountName('discord', '  Account#1234 '), 'Account#1234');
  assert.throws(() => checkAccountName('discord', ''), /Give the account a name/);
  assert.throws(() => checkAccountName('discord', { name: 'x' }), /must be text/);
});

test('a Telegram handle keeps or gains its @', () => {
  assert.equal(checkAccountName('telegram', '@daniel_ryan314'), '@daniel_ryan314');
  assert.equal(checkAccountName('telegram', 'daniel_ryan314'), '@daniel_ryan314');
  for (const bad of ['@ab', '@dan iel', '@dan-iel', '']) assert.throws(() => checkAccountName('telegram', bad));
});

test('a WhatsApp account is a phone number', () => {
  assert.equal(checkAccountName('whatsapp', '+1 (809) 292-4098'), '+1 (809) 292-4098');
  assert.equal(checkAccountName('whatsapp', '0612345678'), '0612345678');
  for (const bad of ['', 'daniel', '+1 809', '123abc456']) assert.throws(() => checkAccountName('whatsapp', bad));
});

test('an optional phone number may be empty', () => {
  assert.equal(checkPhone(''), '');
  assert.equal(checkPhone(undefined), '');
  assert.equal(checkPhone('+14307321270'), '+14307321270');
  assert.throws(() => checkPhone('call me'), /phone number/);
});
