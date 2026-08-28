// Parity checks for js/terminator.js.
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
//     -m spec/check_terminator.mjs
//
// The terminator has strong closed-form properties -- it is a great circle, it
// touches the polar circles at the solstices, and it always divides the globe
// in half -- so every check below is against geometry rather than against this
// code's own output.

import { terminatorLat, nightPolygon, nightFraction, isDaylight } from '../js/terminator.js';
import { subsolarPoint, altitude, makeObserver } from '../js/sun.js';

let failures = 0;
function check(name, got, want, tol = 0) {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol
                                      : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    print(`FAIL ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)} (tol ${tol})`);
  }
}

// --- solstice geometry ------------------------------------------------------
// With the sun at its northern extreme (dec = +23.44), the terminator touches
// the Antarctic circle at the subsolar meridian and the Arctic circle at the
// antisolar one. Those two numbers are the definition of the polar circles, so
// getting them back is a real check rather than a restatement.
const DEC = 23.44;
check('solstice: subsolar meridian touches Antarctic circle',
      terminatorLat(0, 0, DEC), -(90 - DEC), 1e-9);
check('solstice: antisolar meridian touches Arctic circle',
      terminatorLat(180, 0, DEC), 90 - DEC, 1e-9);
check('solstice: quadrature crosses the equator',
      terminatorLat(90, 0, DEC), 0, 1e-9);

// Southern solstice mirrors it exactly.
check('southern solstice mirrors',
      terminatorLat(0, 0, -DEC), 90 - DEC, 1e-9);

// Shifting the subsolar longitude shifts the whole curve with it.
check('curve follows the subsolar meridian',
      terminatorLat(45, 45, DEC), terminatorLat(0, 0, DEC), 1e-9);

// --- it is a great circle, so exactly half the globe is dark ----------------
for (const dec of [-23.44, -12, -0.001, 0, 0.001, 5, 23.44]) {
  check(`half dark at dec ${dec}`, nightFraction({ lat: dec, lon: 0 }), 0.5, 1e-4);
}
for (const lon of [-180, -77, 0, 90, 180]) {
  check(`half dark at subsolar lon ${lon}`, nightFraction({ lat: 15, lon }), 0.5, 1e-4);
}

// --- agreement with the ephemeris -------------------------------------------
// The real test: for actual moments, does the boundary this computes match
// where astronomy-engine puts the sun on the horizon? Sampling a range of
// longitudes catches sign errors that a single point would miss.
for (const iso of ['2026-03-20T12:00:00Z', '2026-06-21T00:00:00Z',
                   '2026-08-28T17:30:00Z', '2026-12-21T06:00:00Z']) {
  const sub = subsolarPoint(new Date(iso));
  let worst = 0;
  for (let lon = -180; lon < 180; lon += 15) {
    const lat = terminatorLat(lon, sub.lon, sub.lat);
    if (Math.abs(lat) > 89.5) continue; // arctangent is vertical here; skip
    const alt = altitude(new Date(iso), makeObserver(lat, lon));
    worst = Math.max(worst, Math.abs(alt));
  }
  check(`terminator is the horizon on ${iso.slice(0, 10)}`, worst, 0, 0.02);
}

// --- daylight test agrees with the ephemeris --------------------------------
const noon = new Date('2026-08-28T17:00:00Z');
const sub = subsolarPoint(noon);
let mismatches = 0;
for (let lat = -80; lat <= 80; lat += 10) {
  for (let lon = -180; lon < 180; lon += 20) {
    const alt = altitude(noon, makeObserver(lat, lon));
    if (Math.abs(alt) < 0.5) continue; // too close to the boundary to be decisive
    if (isDaylight(lat, lon, sub) !== alt > 0) mismatches++;
  }
}
check('isDaylight agrees with the ephemeris everywhere', mismatches, 0);

// --- polygon shape ----------------------------------------------------------
const poly = nightPolygon({ lat: DEC, lon: 0 }, 360);
check('polygon has samples plus two closing points', poly.length, 363);
check('polygon spans -180', poly[0][0], -180);
check('polygon spans +180', poly[360][0], 180);
check('northern summer closes on the south pole', poly[361][1], -90);
check('northern summer closes on the south pole (2)', poly[362][1], -90);

const polyS = nightPolygon({ lat: -DEC, lon: 0 }, 360);
check('southern summer closes on the north pole', polyS[361][1], 90);

// Every sampled latitude must be a real number inside the globe -- this is what
// would catch the equinox singularity escaping the guard.
for (const dec of [0, 1e-9, -1e-9, 90, -90]) {
  const p = nightPolygon({ lat: dec, lon: 0 }, 72);
  const bad = p.filter(([, lat]) => !Number.isFinite(lat) || Math.abs(lat) > 90.0001);
  check(`no invalid latitudes at dec ${dec}`, bad.length, 0);
}

if (failures) {
  print(`\n${failures} check(s) failed.`);
  throw new Error('terminator parity failed');
}
print('terminator.js: all checks passed.');
