import test from 'node:test';
import assert from 'node:assert/strict';
import { isTimeZone, setTeamTimeZone, teamDayEnd, teamNow, teamTimeZone, teamToday } from '../src/utils/teamTime.js';
import { periodKey } from '../src/utils/period.js';

// Each test sets the zone it needs and puts the previous one back.
const inZone = (zone, fn) => {
  const before = teamTimeZone();
  setTeamTimeZone(zone);
  try { fn(); } finally { setTeamTimeZone(before); }
};

test('only real IANA zones are accepted', () => {
  assert.ok(isTimeZone('Europe/Berlin'));
  assert.ok(isTimeZone('UTC'));
  assert.ok(!isTimeZone('Mars/Olympus'));
  assert.ok(!isTimeZone(''));
  assert.ok(!isTimeZone(42));
  assert.throws(() => setTeamTimeZone('Nowhere/Land'));
});

test('today is the team\'s calendar day, not the UTC one', () => {
  // 23:30 UTC on 31 Oct: already 1 Nov in Tokyo, still 31 Oct in São Paulo.
  const at = new Date('2026-10-31T23:30:00Z');
  inZone('Asia/Tokyo', () => {
    assert.equal(teamToday(at).toISOString(), '2026-11-01T00:00:00.000Z');
    assert.equal(periodKey('daily', teamNow(at)), '2026-11-01');
    assert.equal(periodKey('monthly', teamNow(at)), '2026-11');
  });
  inZone('America/Sao_Paulo', () => {
    assert.equal(teamToday(at).toISOString(), '2026-10-31T00:00:00.000Z');
    assert.equal(teamNow(at).toISOString(), '2026-10-31T20:30:00.000Z');
  });
  inZone('UTC', () => assert.equal(periodKey('daily', teamNow(at)), '2026-10-31'));
});

test('the day ends at the team\'s next local midnight', () => {
  inZone('Asia/Tokyo', () => {
    // 10:00 in Tokyo on 28 Oct -> midnight 29 Oct JST = 15:00 UTC on 28 Oct.
    assert.equal(teamDayEnd(new Date('2026-10-28T01:00:00Z')).toISOString(), '2026-10-28T15:00:00.000Z');
  });
  inZone('Europe/Berlin', () => {
    // 25 Oct 2026 is 25 hours long in Berlin (clocks go back at 03:00):
    // midnight after it is 23:00 UTC, not 22:00.
    assert.equal(teamDayEnd(new Date('2026-10-25T10:00:00Z')).toISOString(), '2026-10-25T23:00:00.000Z');
  });
});
