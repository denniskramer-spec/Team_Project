import test from 'node:test';
import assert from 'node:assert/strict';
import { latestPerGroup, canChangeGroupRecord } from '../src/utils/groupRecords.js';

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);

test('a list shows one group record per group: the newest', () => {
  const records = [
    { group: A, income: 100, updatedAt: new Date('2026-09-10T08:00Z') },
    { group: A, income: 250, updatedAt: new Date('2026-09-10T17:00Z') },
    { group: { _id: B }, income: 70, updatedAt: new Date('2026-09-10T09:00Z') },
  ];
  assert.deepEqual(latestPerGroup(records).map((r) => r.income).sort(), [250, 70]);
  assert.deepEqual(latestPerGroup([]), []);
});

test('a group record belongs to the bosses of its group', () => {
  const record = { group: A, author: 'someone-else' };
  assert.ok(canChangeGroupRecord({ role: 'boss', group: A }, record));
  assert.ok(canChangeGroupRecord({ role: 'boss', group: A }, { group: { _id: A } }));
  assert.ok(!canChangeGroupRecord({ role: 'boss', group: B }, record));
  assert.ok(!canChangeGroupRecord({ role: 'boss', group: null }, record));
  assert.ok(!canChangeGroupRecord({ role: 'member', group: A }, record));
  assert.ok(!canChangeGroupRecord({ role: 'leader', group: null }, record));
});
