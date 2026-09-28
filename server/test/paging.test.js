import test from 'node:test';
import assert from 'node:assert/strict';
import { olderThan } from '../src/utils/paging.js';
import { parsePeriod } from '../src/utils/period.js';

test('no cursor, no filter', () => {
  assert.equal(olderThan({}), null);
});

test('the cursor includes rows that share the timestamp but have an older id', () => {
  const before = '2026-09-28T10:00:00.000Z';
  const f = olderThan({ before, beforeId: 'a'.repeat(24) });
  assert.equal(f.$or.length, 2);
  assert.deepEqual(f.$or[0], { createdAt: { $lt: new Date(before) } });
  assert.equal(f.$or[1].createdAt.toISOString(), before);
  assert.equal(String(f.$or[1]._id.$lt), 'a'.repeat(24));
  assert.deepEqual(olderThan({ before }), { createdAt: { $lt: new Date(before) } });
});

test('a bad cursor is a 400', () => {
  assert.throws(() => olderThan({ before: 'garbage' }), { status: 400 });
  assert.throws(() => olderThan({ before: '2026-09-28T10:00:00.000Z', beforeId: 'nope' }), { status: 400 });
});

test('a period key must be text', () => {
  for (const bad of [{ toString: 'x' }, {}, [], 5, null]) assert.throws(() => parsePeriod('weekly', bad), { status: 400 });
});
