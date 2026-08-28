// Parity checks for js/grid.js.
//
// Run with the JavaScriptCore shell that ships with macOS, since this machine
// has no node:
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
//     -m spec/check_grid.mjs
//
// Exits non-zero on any failure, so it can gate a commit.

import { toLatLon, fromLatLon, isValid, cellSizeKm } from '../js/grid.js';

let failures = 0;
function check(name, got, want, tol = 0) {
  const ok =
    typeof want === 'number' && typeof got === 'number'
      ? Math.abs(got - want) <= tol
      : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    print(`FAIL ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
  return ok;
}

// --- validation -------------------------------------------------------------
for (const s of ['FM17', 'FM17ax', 'FM17AX', 'fm17ax', 'FM17ax09', 'JJ00aa'])
  check(`isValid(${s})`, isValid(s), true);
for (const s of ['', null, 'FM1', 'FM177', 'SM17', 'FM17zz', 'FM17ax0', '12ab'])
  check(`isValid(${s})`, isValid(s), false);

// --- known locators ---------------------------------------------------------
// FM17: field F=5 -> lon -80..-60; M=12 -> lat 30..40. Square 1,7 -> lon
// -78..-76, lat 37..38. Centre is therefore -77, 37.5.
check('FM17 lat', toLatLon('FM17').lat, 37.5, 1e-9);
check('FM17 lon', toLatLon('FM17').lon, -77.0, 1e-9);

// The corners of the whole grid.
check('AA00 lat', toLatLon('AA00').lat, -89.5, 1e-9);
check('AA00 lon', toLatLon('AA00').lon, -179.0, 1e-9);
check('RR99 lat', toLatLon('RR99').lat, 89.5, 1e-9);
check('RR99 lon', toLatLon('RR99').lon, 179.0, 1e-9);

// JJ00aa sits just south-west of 0N 0E: the subsquare is 5' x 2.5', so its
// centre is half of that away from the field boundary.
check('JJ00aa lat', toLatLon('JJ00aa').lat, 0 + (1 / 24) / 2, 1e-9);
check('JJ00aa lon', toLatLon('JJ00aa').lon, 0 + (2 / 24) / 2, 1e-9);

// --- precision widens the cell, never moves the operator far -----------------
const four = toLatLon('FM17');
const six = toLatLon('FM17ax');
check('6-char stays inside its 4-char square (lat)', Math.abs(six.lat - four.lat) < 0.5, true);
check('6-char stays inside its 4-char square (lon)', Math.abs(six.lon - four.lon) < 1.0, true);

// --- round trips ------------------------------------------------------------
// Encoding the centre of a square must return that square.
for (const s of ['FM17', 'AA00', 'RR99', 'JJ00', 'IO91', 'PM95']) {
  const { lat, lon } = toLatLon(s);
  check(`round trip ${s}`, fromLatLon(lat, lon, 4), s);
}
for (const s of ['FM17ax', 'IO91wm', 'JJ00aa', 'RR99xx']) {
  const { lat, lon } = toLatLon(s);
  check(`round trip ${s}`, fromLatLon(lat, lon, 6), s);
}
for (const s of ['FM17ax09', 'IO91wm55']) {
  const { lat, lon } = toLatLon(s);
  check(`round trip ${s}`, fromLatLon(lat, lon, 8), s);
}

// A point anywhere inside a square must encode to that square, not just the
// centre -- this is what catches floor/rounding errors.
check('inside FM17, SW of centre', fromLatLon(37.01, -77.99, 4), 'FM17');
check('inside FM17, NE of centre', fromLatLon(37.99, -76.01, 4), 'FM17');

// --- edges ------------------------------------------------------------------
// lat 90 clamps into the top row (R9); lon 0 is the first square of field J.
check('north pole clamps', fromLatLon(90, 0, 4), 'JR09');
check('south pole', fromLatLon(-90, -180, 4), 'AA00');
check('antimeridian wraps', fromLatLon(0, 180, 4), fromLatLon(0, -180, 4));
check('bad input returns null', toLatLon('nope'), null);
check('bad latlon returns null', fromLatLon(NaN, 0), null);

// --- cell size, the settings-page argument ----------------------------------
// DESIGN.md claims FM17 is ~176 km wide and FM17ax ~7 km. Confirm both.
const c4 = cellSizeKm('FM17');
const c6 = cellSizeKm('FM17ax');
check('FM17 is ~176 km wide', Math.round(c4.lon), 177, 2);
check('FM17ax is ~7 km wide', Math.round(c6.lon), 7, 1);
check('FM17ax is ~5 km tall', Math.round(c6.lat), 5, 1);

if (failures) {
  print(`\n${failures} check(s) failed.`);
  throw new Error('grid parity failed');
}
print('grid.js: all checks passed.');
