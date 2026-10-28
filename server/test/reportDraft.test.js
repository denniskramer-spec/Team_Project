import test from 'node:test';
import assert from 'node:assert/strict';
import { keepPaid, versionedWrite, upcomingFields } from '../src/utils/reportDraft.js';

const T1 = 'a'.repeat(24);
const T2 = 'b'.repeat(24);
const INCOME = 'c'.repeat(24);

test('a re-saved report keeps the paid marks of the stored work', () => {
  const stored = [{ task: T1, hours: 2, amount: 100, paidBy: INCOME }, { task: T2, hours: 1, amount: 50, paidBy: null }];
  const sent = [{ task: T1, text: 'more', hours: 3, amount: 150 }, { task: T2, hours: 1, amount: 50 }];
  assert.deepEqual(keepPaid(stored, sent), [
    { task: T1, text: 'more', hours: 3, amount: 150, paidBy: INCOME },
    { task: T2, hours: 1, amount: 50, paidBy: null },
  ]);
  assert.deepEqual(keepPaid(undefined, sent).map((w) => w.paidBy), [null, null]);
});

test('the write names the version it read; a first save inserts', () => {
  const key = { author: 'me', type: 'daily', period: '2026-10-28', scope: 'personal' };
  const at = new Date('2026-10-28T10:00:00Z');
  assert.deepEqual(versionedWrite(key, { updatedAt: at }), { filter: { ...key, updatedAt: at }, options: { new: true } });
  assert.deepEqual(versionedWrite(key, null), { filter: key, options: { new: true, upsert: true, setDefaultsOnInsert: true } });
});

test('the unpaid work adds up to the upcoming amount, due on the report day', () => {
  const day = new Date('2026-10-28T00:00:00Z');
  const work = [{ task: T1, amount: 100, paidBy: INCOME }, { task: T2, amount: 50.25, paidBy: null }];
  assert.deepEqual(upcomingFields(work, day), { work, upcomingAmount: 50.25, upcomingDate: day });
  assert.equal(upcomingFields([{ task: T1, amount: 100, paidBy: INCOME }], day).upcomingDate, null);
});
