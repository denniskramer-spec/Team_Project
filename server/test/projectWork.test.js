import test from 'node:test';
import assert from 'node:assert/strict';
import { summaryFromRows } from '../src/utils/projectWork.js';

const T1 = 'a'.repeat(24);
const T2 = 'b'.repeat(24);
const ME = 'c'.repeat(24);
const OTHER = 'd'.repeat(24);

test('a project sums the days, hours and unpaid work of its owner, and what was paid', () => {
  const owners = new Map([[T1, ME], [T2, ME]]);
  const work = [
    { _id: { task: T1, author: ME }, days: 3, hours: 7.5, upcoming: 120.004, todays: 1 },
    { _id: { task: T1, author: OTHER }, days: 9, hours: 99, upcoming: 999, todays: 1 }, // a previous owner's log
    { _id: { task: T2, author: ME }, days: 1, hours: 0, upcoming: 0, todays: 0 },
  ];
  const paid = [{ _id: T1, amount: 80.456 }];
  assert.deepEqual(summaryFromRows(work, paid, owners), {
    [T1]: { days: 3, hours: 7.5, upcoming: 120, paid: 80.46, today: true },
    [T2]: { days: 1, hours: 0, upcoming: 0, paid: 0, today: false },
  });
});

test('a project with income but no reported work still shows what was paid', () => {
  assert.deepEqual(summaryFromRows([], [{ _id: T1, amount: 10 }], new Map([[T1, ME]])), {
    [T1]: { days: 0, hours: 0, upcoming: 0, paid: 10, today: false },
  });
  assert.deepEqual(summaryFromRows([], [], new Map()), {});
});
