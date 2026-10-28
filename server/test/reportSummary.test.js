import test from 'node:test';
import assert from 'node:assert/strict';
import { sumOf, groupSummary } from '../src/utils/reportSummary.js';

const G = { _id: 'g'.repeat(24), name: 'Group1', slug: 'group1' };
const other = 'h'.repeat(24);

test('reports add up item by item; older reports count their bid as job bids', () => {
  const sums = sumOf([
    { jobBid: 10, aiBid: 2, income: 100, work: [{ amount: 40 }, { amount: 0.005 }] },
    { bid: 5, resumes: 1, work: [] },
  ]);
  assert.equal(sums.jobBid, 15);
  assert.equal(sums.aiBid, 2);
  assert.equal(sums.resumes, 1);
  assert.equal(sums.income, 100);
  assert.equal(sums.earned, 40.01);
});

test("a group's day is its members' reports added up", () => {
  const reports = [
    { group: G._id, sentAt: new Date(), work: [{ text: 'did x', hours: 2 }, { text: ' ', hours: 1 }], calls: [{}], issues: 'blocked', author: { name: 'Ana' } },
    { group: { _id: G._id }, sentAt: null, work: [], calls: [], issues: '' },
    { group: other, sentAt: new Date(), work: [{ text: 'elsewhere', hours: 8 }], calls: [] },
  ];
  const expected = [{ group: G._id }, { group: G._id }, { group: { _id: G._id } }, { group: other }];
  const day = groupSummary(G, reports, expected);
  assert.deepEqual(day.group, { id: G._id, name: 'Group1', slug: 'group1' });
  assert.equal(day.expected, 3);
  assert.equal(day.sent, 1);
  assert.equal(day.drafts, 1);
  assert.equal(day.projectsWritten, 1);
  assert.equal(day.hours, 3);
  assert.equal(day.calls, 1);
  assert.deepEqual(day.issues, [{ member: 'Ana', text: 'blocked' }]);
});
