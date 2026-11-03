import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDayStart, isTimeZone, setTeamDayStart, setTeamTimeZone, teamDayEnd, teamDayStart, teamNow,
  teamReportReminder, teamTimeZone, teamToday,
} from '../src/utils/teamTime.js';
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

// Runs `fn` with the day starting at `start`, then back to midnight.
const startingAt = (start, fn) => {
  const before = teamDayStart();
  setTeamDayStart(start);
  try { fn(); } finally { setTeamDayStart(before); }
};

test('only HH:MM day starts are accepted', () => {
  assert.ok(isDayStart('00:00'));
  assert.ok(isDayStart('06:30'));
  assert.ok(isDayStart('23:59'));
  for (const bad of ['24:00', '6:00', '06:60', '', null, '06:00:00']) assert.ok(!isDayStart(bad), String(bad));
  assert.throws(() => setTeamDayStart('25:00'));
  assert.equal(teamDayStart(), '00:00');
});

test('before the day start it is still the previous day', () => {
  inZone('Europe/Lisbon', () => startingAt('06:00', () => {
    // 3 Nov 2026 in Lisbon is UTC+0. 05:59 still belongs to 2 Nov.
    assert.equal(teamToday(new Date('2026-11-03T05:59:00Z')).toISOString(), '2026-11-02T00:00:00.000Z');
    assert.equal(periodKey('daily', teamNow(new Date('2026-11-03T05:59:00Z'))), '2026-11-02');
    assert.equal(teamToday(new Date('2026-11-03T06:00:00Z')).toISOString(), '2026-11-03T00:00:00.000Z');
    // The day ends at the next 06:00 and reminds 30 minutes before.
    assert.equal(teamDayEnd(new Date('2026-11-02T20:00:00Z')).toISOString(), '2026-11-03T06:00:00.000Z');
    assert.equal(teamDayEnd(new Date('2026-11-03T05:59:00Z')).toISOString(), '2026-11-03T06:00:00.000Z');
    assert.equal(teamReportReminder(new Date('2026-11-03T01:00:00Z')).toISOString(), '2026-11-03T05:30:00.000Z');
  }));
  inZone('Asia/Tokyo', () => startingAt('08:30', () => {
    // 08:30 JST on 4 Nov = 23:30 UTC on 3 Nov.
    assert.equal(teamDayEnd(new Date('2026-11-03T12:00:00Z')).toISOString(), '2026-11-03T23:30:00.000Z');
  }));
});

test('a day start keeps daylight saving in mind', () => {
  inZone('Europe/Berlin', () => startingAt('06:00', () => {
    // Clocks go back at 03:00 on 25 Oct 2026: 06:00 that morning is 05:00
    // UTC, while the start before it (24 Oct) was 04:00 UTC.
    assert.equal(teamDayEnd(new Date('2026-10-24T12:00:00Z')).toISOString(), '2026-10-25T05:00:00.000Z');
    assert.equal(teamToday(new Date('2026-10-25T04:30:00Z')).toISOString(), '2026-10-24T00:00:00.000Z');
  }));
});
