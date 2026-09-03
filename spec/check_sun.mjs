// Parity checks for js/sun.js.
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
//     -m spec/check_sun.mjs
//
// The values below are checked against physics that can be reasoned about
// independently -- equinoxes, solstices, and the noon meridian -- rather than
// against this code's own previous output, which would only prove it is
// consistent with itself.

import {
  subsolarPoint, sublunarPoint, horizonEvents, greyLine, altitude, makeObserver,
  normaliseLon, GREY_UPPER, GREY_LOWER,
} from '../js/sun.js';
import * as Astronomy from '../vendor/astronomy.js';
import { toLatLon } from '../js/grid.js';

let failures = 0;
function check(name, got, want, tol = 0) {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol
                                      : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    print(`FAIL ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)} (tol ${tol})`);
  }
}
const utc = (s) => new Date(s);
const mins = (a, b) => Math.abs(a - b) / 60000;

// --- longitude normalisation ------------------------------------------------
check('normalise 0', normaliseLon(0), 0);
check('normalise 180', normaliseLon(180), 180);
check('normalise 181', normaliseLon(181), -179);
check('normalise -180', normaliseLon(-180), 180);
check('normalise 540', normaliseLon(540), 180);
check('normalise -190', normaliseLon(-190), 170);

// --- subsolar point ---------------------------------------------------------
// At 12:00 UTC the sun is near the Greenwich meridian; it is not exactly on it
// because of the equation of time, which peaks around 16 minutes -- 4 degrees.
for (const d of ['2026-03-20T12:00:00Z', '2026-06-21T12:00:00Z',
                 '2026-09-22T12:00:00Z', '2026-12-21T12:00:00Z']) {
  check(`subsolar lon near 0 at noon UTC ${d.slice(0, 10)}`,
        subsolarPoint(utc(d)).lon, 0, 4.2);
}

// Declination tracks the seasons: ~0 at the equinoxes, +/-23.44 at solstices.
check('equinox declination ~0', subsolarPoint(utc('2026-03-20T14:46:00Z')).lat, 0, 0.02);
check('June solstice declination', subsolarPoint(utc('2026-06-21T08:25:00Z')).lat, 23.44, 0.02);
check('Dec solstice declination', subsolarPoint(utc('2026-12-21T20:50:00Z')).lat, -23.44, 0.02);

// The subsolar point travels west at 15 degrees per hour.
const t0 = utc('2026-08-28T00:00:00Z');
const t1 = utc('2026-08-28T06:00:00Z');
const drift = normaliseLon(subsolarPoint(t0).lon - subsolarPoint(t1).lon);
check('subsolar drifts 15 deg/hour', drift, 90, 0.3);

// The sun is directly overhead at its own subsolar point, by definition. This
// is the check that would catch a sign error or an hours/degrees mix-up.
for (const d of ['2026-01-15T03:00:00Z', '2026-08-28T17:00:00Z']) {
  const p = subsolarPoint(utc(d));
  check(`altitude at subsolar point is 90 (${d.slice(0, 10)})`,
        altitude(utc(d), makeObserver(p.lat, p.lon)), 90, 0.03);
}

// --- horizon events at FM17 -------------------------------------------------
const fm17 = toLatLon('FM17');
const obs = makeObserver(fm17.lat, fm17.lon);

// Richmond VA, 28 Aug 2026: sunset about 19:44 EDT = 23:44 UTC, sunrise next
// morning about 06:38 EDT = 10:38 UTC. Checked against published tables.
const ev = horizonEvents(utc('2026-08-28T12:00:00Z'), obs);
check('FM17 sunset within 5 min of 23:44Z', mins(ev.sunset, utc('2026-08-28T23:44:00Z')) < 5, true);
check('FM17 sunrise within 5 min of 10:38Z', mins(ev.sunrise, utc('2026-08-29T10:38:00Z')) < 5, true);

// At an equinox, day and night are near enough equal everywhere.
const eq = horizonEvents(utc('2026-03-20T06:00:00Z'), obs);
const dayLen = (eq.sunset - eq.sunrise) / 3600000;
check('equinox day length ~12h', dayLen, 12, 0.2);

// --- grey line --------------------------------------------------------------
// Just before sunset the sun is above +2, so the band has not opened.
const beforeDusk = greyLine(utc('2026-08-28T22:00:00Z'), obs);
check('not in band well before sunset', beforeDusk.active, false);
check('band opens before sunset', beforeDusk.start < ev.sunset, true);

// The window must bracket sunset, and last a sensible span.
check('dusk window contains sunset', beforeDusk.start < ev.sunset && beforeDusk.end > ev.sunset, true);
const durMin = (beforeDusk.end - beforeDusk.start) / 60000;
check('dusk window is 40-70 min at FM17', durMin > 35 && durMin < 75, true);

// Altitudes at the boundaries must be the stated convention, which is the
// check that catches the band being computed from the wrong thresholds.
// Geometric, matching what SearchAltitude solves for -- see sun.js.
check('window opens at +2 deg geometric', altitude(beforeDusk.start, obs), GREY_UPPER, 0.001);
check('window closes at -8 deg geometric', altitude(beforeDusk.end, obs), GREY_LOWER, 0.001);

// The refracted reading at those same instants differs by a quarter degree or
// so. Pinned here because the two conventions living side by side is
// deliberate, and a future change that quietly unified them should fail.
check('refraction lifts the upper edge', altitude(beforeDusk.start, obs, 'normal') > GREY_UPPER + 0.2, true);
check('sunset is ~-0.83 deg geometric', altitude(ev.sunset, obs), -0.83, 0.02);

// Inside the window the state flips to active and start goes away.
const during = greyLine(new Date((beforeDusk.start.getTime() + beforeDusk.end.getTime()) / 2), obs);
check('active inside the window', during.active, true);
check('active window reports no start', during.start, null);
check('active window ends at the same instant', mins(during.end, beforeDusk.end) < 0.02, true);

// There are two per day. The dawn one must also bracket sunrise.
const beforeDawn = greyLine(utc('2026-08-29T08:00:00Z'), obs);
check('dawn window contains sunrise',
      beforeDawn.start < ev.sunrise && beforeDawn.end > ev.sunrise, true);

// --- polar honesty ----------------------------------------------------------
// Longyearbyen in midsummer: the sun stays up, so there is no grey line and
// the answer must be null rather than a countdown to nothing.
const svalbard = makeObserver(78.22, 15.65);
check('no grey line in polar day', greyLine(utc('2026-06-21T12:00:00Z'), svalbard), null);
check('no sunset in polar day', horizonEvents(utc('2026-06-21T12:00:00Z'), svalbard).sunset, null);

// The equator always has one, twice a day, all year.
const quito = makeObserver(-0.18, -78.47);
for (const d of ['2026-01-01T12:00:00Z', '2026-06-21T12:00:00Z', '2026-12-21T12:00:00Z']) {
  const g = greyLine(utc(d), quito);
  check(`equator has a grey line on ${d.slice(0, 10)}`, g !== null, true);
}

// --- the sublunar point -----------------------------------------------------
// Checked against orbital geometry rather than against an almanac, in the same
// spirit as everything above: the Moon's own phases say where its subpoint has
// to be, and astronomy-engine can be asked when those phases are without being
// asked where the Moon is.

const D2R = Math.PI / 180;

/** Great-circle angle between two lat/lon points, in degrees. */
function separation(a, b) {
  const cos = Math.sin(a.lat * D2R) * Math.sin(b.lat * D2R)
            + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.cos((a.lon - b.lon) * D2R);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / D2R;
}

/** Signed difference in longitude, taken the short way round. */
function lonDelta(from, to) {
  return normaliseLon(to - from);
}

// The subpoint latitude is the declination, and lunar declination is bounded by
// the obliquity plus the orbit's inclination -- 23.44 + 5.15, so never beyond
// about 28.6 degrees. A subpoint wandering into the Arctic would mean the hour
// angle and the declination had been swapped.
for (let month = 0; month < 12; month++) {
  const d = new Date(Date.UTC(2026, month, 15, 6, 0, 0));
  const { lat } = sublunarPoint(d);
  check(`sublunar latitude is within lunar declination limits in month ${month + 1}`,
    Math.abs(lat) <= 28.8, true);
}

// It runs west, and slower than the Sun: the Moon gains about half a degree a
// day on the stars in the direction the Earth turns, so its subpoint completes
// a circuit in 24 h 50 m rather than 24 h. The rate wobbles with the orbit, so
// the tolerance is wide enough for perigee and apogee both.
for (const iso of ['2026-02-04T00:00:00Z', '2026-07-19T09:00:00Z', '2026-11-02T18:00:00Z']) {
  const t0 = new Date(iso);
  const t1 = new Date(t0.getTime() + 3600 * 1000);
  const drift = lonDelta(sublunarPoint(t0).lon, sublunarPoint(t1).lon);
  check(`sublunar point runs west at about 14.5 deg/h from ${iso.slice(0, 10)}`,
    drift, -14.49, 1.2);
  // The tolerance above has to be wide enough for perigee and apogee, which
  // makes it wide enough to admit the Sun's 15.0. This is the part that does
  // not: the Moon runs east against the stars an order of magnitude faster
  // than the Sun does, so its subpoint is always the slower of the two.
  check(`sublunar point drifts slower than the Sun from ${iso.slice(0, 10)}`,
    drift > -14.95, true);
}

// At new moon the Moon and Sun share an ecliptic longitude, so the two
// subpoints nearly coincide; at full moon they are nearly antipodal. "Nearly"
// is the orbit's 5.15 degree inclination, which is exactly why the Moon does
// not eclipse the Sun every month.
const searchFrom = new Date(Date.UTC(2026, 0, 1));
for (const [name, targetLon] of [['new', 0], ['full', 180]]) {
  const when = Astronomy.SearchMoonPhase(targetLon, searchFrom, 40);
  check(`a ${name} moon is found within 40 days of 2026-01-01`, when !== null, true);
  if (!when) continue;
  const at = when.date;
  const sun = subsolarPoint(at);
  const moon = sublunarPoint(at);
  const target = name === 'new' ? sun : { lat: -sun.lat, lon: normaliseLon(sun.lon + 180) };
  const gap = separation(moon, target);
  check(`at ${name} moon the sublunar point is where the phase says`, gap < 6, true);
  if (gap >= 6) print(`     separation was ${gap.toFixed(2)} deg`);
}

// The subpoint is not the Sun's. A copy-paste that left Body.Sun in place would
// pass every bound above on most days, so say it outright.
const noon = new Date(Date.UTC(2026, 4, 20, 12, 0, 0));
check('the Moon is not at the subsolar point on an ordinary day',
  separation(sublunarPoint(noon), subsolarPoint(noon)) > 10, true);

if (failures) {
  print(`\n${failures} check(s) failed.`);
  throw new Error('sun parity failed');
}
print('sun.js: all checks passed.');
