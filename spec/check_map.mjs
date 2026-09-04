// Parity checks for the pure parts of js/map.js -- projection and decoding.
// The canvas calls are not covered here; they are verified by rendering the
// map and looking at it, which is the only check that catches an inverted
// axis or a wrong fill.
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
//     -m spec/check_map.mjs

import { project, unproject, projectCoastline, canvasSize } from '../js/map.js';
import { toLatLon } from '../js/grid.js';

let failures = 0;
function check(name, got, want, tol = 0) {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol
                                      : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    print(`FAIL ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
}

const W = 1080, H = 540;

// --- corners and centre -----------------------------------------------------
check('north-west corner x', project(-180, 90, W, H).x, 0, 1e-9);
check('north-west corner y', project(-180, 90, W, H).y, 0, 1e-9);
check('south-east corner x', project(180, -90, W, H).x, W, 1e-9);
check('south-east corner y', project(180, -90, W, H).y, H, 1e-9);
check('null island x', project(0, 0, W, H).x, W / 2, 1e-9);
check('null island y', project(0, 0, W, H).y, H / 2, 1e-9);

// Latitude increases upward on the globe and downward in pixels. Getting this
// backwards produces a map that still looks like Earth, upside down, which is
// exactly the kind of thing a numeric check should catch before eyes do.
check('north is up', project(0, 45, W, H).y < project(0, -45, W, H).y, true);
check('east is right', project(90, 0, W, H).x > project(-90, 0, W, H).x, true);

// --- round trip -------------------------------------------------------------
for (const [lon, lat] of [[-180, 90], [0, 0], [77.5, -12.25], [180, -90], [-77, 37.5]]) {
  const p = project(lon, lat, W, H);
  const back = unproject(p.x, p.y, W, H);
  check(`round trip lon ${lon}`, back.lon, lon, 1e-9);
  check(`round trip lat ${lat}`, back.lat, lat, 1e-9);
}

// --- scale independence -----------------------------------------------------
// The same place must land at the same fraction of the canvas at any size.
for (const [w, h] of [[360, 180], [1080, 540], [2160, 1080]]) {
  const p = project(-77, 37.5, w, h);
  check(`fractional x is stable at ${w}`, p.x / w, 0.2861, 1e-4);
  check(`fractional y is stable at ${w}`, p.y / h, 0.2917, 1e-4);
}

// --- FM17 lands where Virginia is -------------------------------------------
// A crude but decisive placement check: the operator's default grid should sit
// in the left-hand third of the map and the upper half.
const fm17 = toLatLon('FM17');
const p = project(fm17.lon, fm17.lat, W, H);
check('FM17 is in the western hemisphere', p.x < W / 2, true);
check('FM17 is in the northern hemisphere', p.y < H / 2, true);

// --- coastline decode -------------------------------------------------------
// The file stores integers scaled by 100; decoding must divide before
// projecting, not after.
const fake = { scale: 100, lines: [[-18000, 9000, 0, 0, 18000, -9000]] };
const [pts] = projectCoastline(fake, W, H);
check('decoded line has three points', pts.length, 6);
check('first point is the NW corner', [pts[0], pts[1]], [0, 0]);
check('middle point is null island', [pts[2], pts[3]], [W / 2, H / 2]);
check('last point is the SE corner', [pts[4], pts[5]], [W, H]);

// --- canvas sizing ----------------------------------------------------------
// The one piece of arithmetic that decides the map's shape. Getting it wrong
// does not fail, it squashes the world -- the drawing stays a correct 2:1 while
// the element it lands in is not, so continents come out wide and short.

for (const cssW of [320, 768, 1024, 1080, 1440]) {
  const s = canvasSize(cssW, 2);
  check(`${cssW}: css height is half the width`, s.cssH, cssW / 2);
  check(`${cssW}: backing store is 2:1`, Math.abs(s.w / s.h - 2) < 0.01, true);
  check(`${cssW}: backing store follows the device ratio`, s.w, cssW * 2);
}

// An odd width cannot divide exactly; it must still be within a pixel of 2:1
// rather than drifting.
for (const cssW of [1081, 999, 777]) {
  const s = canvasSize(cssW, 2);
  check(`${cssW}: an odd width stays 2:1 within rounding`, Math.abs(s.w / s.h - 2) < 0.01, true);
}

// --- a hidden element measures zero -----------------------------------------
// This is the whole reason the function returns null rather than a size. A
// hidden dashboard has clientWidth 0, and adopting that wrote height:0px onto
// the canvas and rebuilt the basemap at no size, once a minute.
check('zero width is refused', canvasSize(0, 2), null);
check('a negative width is refused', canvasSize(-10, 2), null);
check('a missing width is refused', canvasSize(undefined, 2), null);
check('a NaN width is refused', canvasSize(NaN, 2), null);

// --- the device pixel ratio -------------------------------------------------
check('a 1x display is not upscaled', canvasSize(1000, 1).w, 1000);
check('a 2x display doubles', canvasSize(1000, 2).w, 2000);
check('3x is capped at 2', canvasSize(1000, 3).dpr, 2);
check('and so is anything higher', canvasSize(1000, 4).w, 2000);
check('a missing ratio is treated as 1', canvasSize(1000, undefined).dpr, 1);
check('a nonsense ratio does not shrink the canvas', canvasSize(1000, 0).dpr, 1);

if (failures) {
  print(`\n${failures} check(s) failed.`);
  throw new Error('map parity failed');
}
print('map.js: all checks passed.');
