import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REAL_INCOME, isRealIncome, needsApproval, canApproveIncome, canWithdrawIncome,
} from '../src/utils/incomeApproval.js';

const A = 'a'.repeat(24);
const admin = { _id: 'admin1', role: 'admin', group: null };
const leader = { _id: 'lead1', role: 'leader', group: null };
const bossA = { _id: 'bossA', role: 'boss', group: A };
const bossNoGroup = { _id: 'boss0', role: 'boss', group: null };
const memberA = { _id: 'memA', role: 'member', group: A };
const memberA2 = { _id: 'memA2', role: 'member', group: A };

test('only a member\'s own income waits for approval', () => {
  assert.ok(needsApproval(memberA));
  assert.ok(!needsApproval(bossA));
  assert.ok(!needsApproval(leader));
  assert.ok(!needsApproval(admin));
});

test('the team leader and a boss with a group approve', () => {
  assert.ok(canApproveIncome(leader));
  assert.ok(canApproveIncome(bossA));
  assert.ok(!canApproveIncome(bossNoGroup));
  assert.ok(!canApproveIncome(memberA));
  assert.ok(!canApproveIncome(admin));
  assert.ok(!canApproveIncome(null));
});

test('only the recorder withdraws, and only while it is pending', () => {
  const pending = { status: 'pending', createdBy: 'memA' };
  assert.ok(canWithdrawIncome(memberA, pending));
  assert.ok(canWithdrawIncome(memberA, { ...pending, createdBy: { _id: 'memA' } })); // populated
  assert.ok(!canWithdrawIncome(memberA2, pending));
  assert.ok(!canWithdrawIncome(leader, pending));
  assert.ok(!canWithdrawIncome(memberA, { ...pending, status: 'approved' }));
  assert.ok(!canWithdrawIncome(memberA, { ...pending, status: 'rejected' }));
});

test('pending and rejected income never counts; older records without a status do', () => {
  assert.ok(isRealIncome({ status: 'approved' }));
  assert.ok(isRealIncome({}));
  assert.ok(isRealIncome({ status: undefined }));
  assert.ok(!isRealIncome({ status: 'pending' }));
  assert.ok(!isRealIncome({ status: 'rejected' }));
});

test('the database filter leaves out exactly what isRealIncome does', () => {
  // REAL_INCOME is the filter every sum of income uses; it must agree with
  // the in-memory check the Income page uses for its own totals.
  const excluded = REAL_INCOME.status.$nin;
  for (const status of ['approved', 'pending', 'rejected', undefined]) {
    assert.equal(!excluded.includes(status), isRealIncome({ status }), `status ${status}`);
  }
});
