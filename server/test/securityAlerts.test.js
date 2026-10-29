import test from 'node:test';
import assert from 'node:assert/strict';
import { alertOf, raiseSecurityAlert } from '../src/utils/securityAlerts.js';

const user = { id: 'u1', name: 'Lena', username: 'lena' };

test('dangerous entries raise an alert, ordinary ones do not', () => {
  assert.equal(alertOf({ action: 'copy.sensitive', flags: ['sensitive-copy'], user, ip: '1.2.3.4' }).kind, 'copy');
  assert.equal(alertOf({ action: 'auth.login', flags: ['new-ip'], user }).kind, 'new-ip');
  assert.equal(alertOf({ action: 'database.update', flags: ['outside-app', 'outside-write'], method: 'DB', userAgent: 'MongoDB Compass' }).kind, 'outside-write');
  assert.equal(alertOf({ action: 'database.delete', flags: ['outside-app', 'outside-write', 'tamper'], method: 'DB' }).kind, 'tamper');
  assert.equal(alertOf({ action: 'auth.login', flags: [], user }), null);
  assert.equal(alertOf({ action: 'incomes.create', flags: [], user }), null);
});

test('the alert names who and where', () => {
  const a = alertOf({ action: 'copy.sensitive', flags: ['sensitive-copy'], user, ip: '1.2.3.4', target: { label: '/finance/incomes' } });
  assert.equal(a.text, 'Lena · /finance/incomes · from 1.2.3.4');
  assert.equal(alertOf({ action: 'database.read', flags: ['outside-app'], method: 'DB', userAgent: 'MongoDB Compass' }).text, 'MongoDB Compass');
});

test('the same alert from the same person is held back for ten minutes', () => {
  const entry = { action: 'database.read', flags: ['outside-app'], method: 'DB', userAgent: 'mongosh', ip: '9.9.9.9' };
  const t = 1_000_000_000;
  assert.equal(raiseSecurityAlert(entry, t), true);
  assert.equal(raiseSecurityAlert(entry, t + 60_000), false);
  assert.equal(raiseSecurityAlert({ ...entry, ip: '8.8.8.8' }, t + 60_000), true);
  assert.equal(raiseSecurityAlert(entry, t + 11 * 60_000), true);
});
