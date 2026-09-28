import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePeriod, periodKey, shiftPeriod, PERIOD_TYPES } from '../src/utils/period.js';

test('the current period key parses for every type', () => {
  for (const type of PERIOD_TYPES) {
    const key = periodKey(type);
    assert.equal(parsePeriod(type, key).key, key);
  }
});

test('period bounds', () => {
  const week = parsePeriod('weekly', '2026-W39');
  assert.equal(week.start.toISOString(), '2026-09-21T00:00:00.000Z'); // a Monday
  assert.equal(week.end.toISOString(), '2026-09-28T00:00:00.000Z');
  const month = parsePeriod('monthly', '2026-02');
  assert.equal(month.end.toISOString(), '2026-03-01T00:00:00.000Z');
  assert.equal(parsePeriod('quarterly', '2026-Q3').start.toISOString(), '2026-07-01T00:00:00.000Z');
  assert.equal(parsePeriod('halfyear', '2026-H2').end.toISOString(), '2027-01-01T00:00:00.000Z');
});

test('keys that would roll over into another period are rejected', () => {
  assert.throws(() => parsePeriod('daily', '2026-02-31'), { status: 400 });
  assert.throws(() => parsePeriod('daily', '2026-13-01'), { status: 400 });
  assert.throws(() => parsePeriod('weekly', '2025-W53'), { status: 400 }); // 2025 has 52 weeks
  assert.equal(parsePeriod('weekly', '2026-W53').key, '2026-W53'); // 2026 has 53
  assert.throws(() => parsePeriod('monthly', '2026-9'), { status: 400 });
  assert.throws(() => parsePeriod('nope', '2026'), { status: 400 });
});

test('shifting crosses year boundaries', () => {
  assert.equal(shiftPeriod('weekly', '2026-W53', 1), '2027-W01');
  assert.equal(shiftPeriod('weekly', '2027-W01', -1), '2026-W53');
  assert.equal(shiftPeriod('daily', '2024-02-28', 1), '2024-02-29');
  assert.equal(shiftPeriod('monthly', '2026-12', 1), '2027-01');
  assert.equal(shiftPeriod('quarterly', '2026-Q1', -1), '2025-Q4');
  assert.equal(shiftPeriod('annual', '2026', 1), '2027');
});
