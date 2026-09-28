import test from 'node:test';
import assert from 'node:assert/strict';
import { canManage, permissionsFor, pendingFilter } from '../src/utils/memberPolicy.js';
import {
  scopeFilter, canManageFor, canSeeMember, canRecordOutcome, canManageOutcome,
} from '../src/utils/visibility.js';
import { canSendTo, canModify, canView, isRecipient } from '../src/utils/instructionPolicy.js';

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const admin = { _id: 'admin1', role: 'admin', group: null };
const leader = { _id: 'lead1', role: 'leader', group: null };
const bossA = { _id: 'bossA', role: 'boss', group: A };
const memberA = { _id: 'memA', role: 'member', group: A };
const memberA2 = { _id: 'memA2', role: 'member', group: A };
const memberB = { _id: 'memB', role: 'member', group: B };

test('who manages whom', () => {
  assert.ok(canManage(admin, leader));
  assert.ok(canManage(leader, bossA));
  assert.ok(!canManage(leader, admin));
  assert.ok(canManage(bossA, memberA));
  assert.ok(!canManage(bossA, memberB));
  assert.ok(!canManage(memberA, memberA2));
});

test('per-row permissions', () => {
  assert.deepEqual(permissionsFor(memberA, memberA), {
    edit: true, changeGroup: false, resetPassword: false, disable: false, changeRole: false,
  });
  assert.equal(permissionsFor(admin, admin).changeRole, false); // not your own role
  assert.equal(permissionsFor(bossA, memberA).disable, false); // bosses don't disable
  assert.equal(permissionsFor(leader, memberB).changeGroup, true);
});

test('pending sign-ups each approver sees', () => {
  assert.deepEqual(pendingFilter(leader), { status: 'pending' });
  assert.deepEqual(pendingFilter(bossA), { status: 'pending', group: A });
  assert.equal(pendingFilter(memberA), null);
});

test('record scope follows the hierarchy', () => {
  assert.deepEqual(scopeFilter(leader, 'owner'), {});
  assert.deepEqual(scopeFilter(bossA, 'owner'), { group: A });
  assert.deepEqual(scopeFilter(memberA, 'owner'), { owner: 'memA' });
  assert.ok(canSeeMember(bossA, memberA2));
  assert.ok(!canSeeMember(bossA, memberB));
  assert.ok(!canSeeMember(memberA, memberA2));
  assert.ok(canManageFor(memberA, memberA));
  assert.ok(!canManageFor(memberA, memberA2));
});

test('outcome: only the leader and bosses record, a boss only in their group', () => {
  assert.ok(canRecordOutcome(leader));
  assert.ok(!canRecordOutcome(admin));
  assert.ok(!canRecordOutcome(memberA));
  assert.ok(canManageOutcome(bossA, memberA));
  assert.ok(!canManageOutcome(bossA, memberB));
  // A whole-team split has shares in every group: a boss may not change it.
  const shares = [{ _id: 'memA', group: A }, { _id: 'memB', group: B }];
  assert.ok(shares.some((s) => !canManageOutcome(bossA, s)));
  assert.ok(shares.every((s) => canManageOutcome(leader, s)));
});

test('instructions: who sends, edits and reads', () => {
  assert.ok(canSendTo(leader, 'all'));
  assert.ok(!canSendTo(bossA, 'all'));
  assert.ok(canSendTo(bossA, 'group', A));
  assert.ok(!canSendTo(bossA, 'group', B));
  assert.ok(canSendTo(bossA, 'member', null, memberA));
  assert.ok(!canSendTo(bossA, 'member', null, memberB));
  assert.ok(!canSendTo(memberA, 'group', A));

  const direct = { target: 'member', author: 'lead1', recipient: 'memA', createdAt: new Date() };
  assert.ok(canView(memberA, direct));
  assert.ok(!canView(memberA2, direct));
  assert.ok(!canView(bossA, direct)); // private to the two of them (and overseers)
  assert.ok(canView(admin, direct));
  assert.ok(isRecipient(memberA, direct));
  assert.ok(!isRecipient(leader, direct)); // the author is not a recipient

  const own = { target: 'group', group: A, author: 'bossA' };
  assert.ok(canModify(bossA, own));
  assert.ok(!canModify(bossA, { ...own, author: 'lead1' }));
  assert.ok(canModify(leader, own));
});
