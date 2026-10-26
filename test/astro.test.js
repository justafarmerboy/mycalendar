import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../js/astro.js';

const minutesOff = (jd, iso) => Math.abs(A.dateOf(jd) - new Date(iso)) / 60000;

test('equinoxes and solstices of 2026 (USNO times, UTC)', () => {
  const expected = ['2026-03-20T14:46Z', '2026-06-21T08:24Z', '2026-09-23T00:05Z', '2026-12-21T20:50Z'];
  A.seasonsOf(2026).forEach((e, i) => assert.ok(minutesOff(e.jd, expected[i]) < 10, `${e.en} ${A.dateOf(e.jd).toISOString()}`));
});

test('new and full moons (USNO times, UTC)', () => {
  const start = A.jdOf(new Date('2026-10-01T00:00Z'));
  assert.ok(minutesOff(A.findMoonPhase(start, 0), '2026-10-10T15:50Z') < 15);
  assert.ok(minutesOff(A.findMoonPhase(start, 180), '2026-10-26T04:12Z') < 15);
  assert.ok(minutesOff(A.findMoonPhase(A.jdOf(new Date('2024-04-01T00:00Z')), 0), '2024-04-08T18:21Z') < 15);
});

test('moon phase and age', () => {
  const p = A.moonPhase(A.jdOf(new Date('2026-10-26T04:12Z')));
  assert.ok(p.illum > 0.99);
  assert.ok(Math.abs(p.age - 15.5) < 0.2, String(p.age));
});

test('day length in Bangkok', () => {
  const june = A.sunTimes(A.jdOf(new Date('2026-06-21T05:00Z')), 13.75, 100.5);
  const dec = A.sunTimes(A.jdOf(new Date('2026-12-21T05:00Z')), 13.75, 100.5);
  assert.ok(june.dayLength > 12.85 && june.dayLength < 13, String(june.dayLength));
  assert.ok(dec.dayLength > 11.2 && dec.dayLength < 11.4, String(dec.dayLength));
  // sunrise in Bangkok on 21 June is about 05:51 local (UTC+7)
  assert.ok(minutesOff(june.rise, '2026-06-20T22:51Z') < 5, A.dateOf(june.rise).toISOString());
});

test('subsolar point', () => {
  const p = A.subsolarPoint(A.jdOf(new Date('2026-06-21T12:00Z')));
  assert.ok(Math.abs(p.lat - 23.43) < 0.05);
  assert.ok(Math.abs(p.lng - 0.4) < 1, String(p.lng));
});

test('bright limb of the Moon as seen in the sky', () => {
  const limb = (iso, lat, lng) => A.moonSky(A.jdOf(new Date(iso)), lat, lng).limb;
  // evening crescent in Bangkok lies like a boat: lit underneath
  const bkk = limb('2026-10-13T11:45Z', 13.75, 100.5);
  assert.ok(bkk > 180 && bkk < 250, String(bkk));
  // first quarter: lit on the right in London, on the left in Sydney
  const lon = limb('2026-10-19T18:00Z', 51.5, -0.13), syd = limb('2026-10-19T09:30Z', -33.87, 151.2);
  assert.ok(lon > 225 && lon < 315, String(lon));
  assert.ok(syd > 45 && syd < 135, String(syd));
});
