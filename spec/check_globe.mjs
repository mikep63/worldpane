// Parity checks for the pure parts of js/globe.js -- the viewing frame, the
// visible-hemisphere test, the drag arithmetic, and the night region.
//
// The night region is the reason this file exists. On the flat map the night
// side is one arctangent per longitude and an obvious pole closure; here it is
// an arc of one great circle stitched to an arc of another, and getting the
// wrong arc produces a filled shape that still looks like a plausible globe.
// The decisive check is the last one: fill classification against the sun
// vector, at several thousand points.
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
//     -m spec/check_globe.mjs

import {
  toVec, toLonLat, dot, basis, project, isVisible,
  wrapLon, shortestLon, rotateBy, ease, interpolate,
  nightRegion, prepareCoastline, decimate, vertexCount,
} from '../js/globe.js';
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

const TOL = 1e-12;

// --- vectors ----------------------------------------------------------------
check('null island', toVec(0, 0), [1, 0, 0]);
check('north pole z', toVec(0, 90)[2], 1, TOL);
check('90E is +y', toVec(90, 0)[1], 1, TOL);
for (const [lon, lat] of [[0, 0], [-77.5, 37.25], [180, -60], [12, 89]]) {
  const v = toVec(lon, lat);
  check(`unit length ${lon},${lat}`, Math.hypot(v[0], v[1], v[2]), 1, TOL);
  const back = toLonLat(v);
  check(`round trip lon ${lon}`, back.lon, lon, 1e-10);
  check(`round trip lat ${lat}`, back.lat, lat, 1e-10);
}

// --- the viewing frame ------------------------------------------------------
// Orthonormality is not decoration: projection is three dot products, so if the
// frame is skewed every coastline is skewed with it and nothing else catches it.
for (const [lon0, lat0] of [[0, 0], [-77, 38], [140, -35], [0, 90], [0, -90]]) {
  const b = basis(lon0, lat0);
  for (const [name, u] of [['e', b.e], ['n', b.n], ['v', b.v]]) {
    check(`|${name}| at ${lon0},${lat0}`, Math.hypot(u[0], u[1], u[2]), 1, 1e-12);
  }
  check(`e.n at ${lon0},${lat0}`, dot(b.e, b.n), 0, 1e-12);
  check(`e.v at ${lon0},${lat0}`, dot(b.e, b.v), 0, 1e-12);
  check(`n.v at ${lon0},${lat0}`, dot(b.n, b.v), 0, 1e-12);

  // The centre of the view is the place the view is centred on. Trivially true
  // and worth pinning: an inverted frame still passes every orthonormality
  // check above.
  const c = project(toVec(lon0, lat0), b);
  check(`centre sx at ${lon0},${lat0}`, c.sx, 0, 1e-12);
  check(`centre sy at ${lon0},${lat0}`, c.sy, 0, 1e-12);
  check(`centre depth at ${lon0},${lat0}`, c.depth, 1, 1e-12);
}

// --- orientation ------------------------------------------------------------
const b0 = basis(0, 0);
check('east is right', project(toVec(45, 0), b0).sx > 0, true);
check('north is up', project(toVec(0, 45), b0).sy > 0, true);
check('the far side is hidden', isVisible(toVec(180, 0), b0), false);
check('the near side is visible', isVisible(toVec(10, 10), b0), true);

// A quarter turn away sits exactly on the limb, at unit radius and zero depth.
const limb = project(toVec(90, 0), b0);
check('limb depth', limb.depth, 0, 1e-12);
check('limb radius', Math.hypot(limb.sx, limb.sy), 1, 1e-12);

// Nothing on the sphere can project outside the disc, at any orientation.
{
  let worst = 0;
  const b = basis(-77, 38);
  for (let lon = -180; lon < 180; lon += 7) {
    for (let lat = -90; lat <= 90; lat += 7) {
      const p = project(toVec(lon, lat), b);
      worst = Math.max(worst, Math.hypot(p.sx, p.sy));
    }
  }
  check('nothing projects outside the disc', worst <= 1 + 1e-12, true);
}

// FM17 is where it was on the flat map, and it faces the viewer from its own
// grid -- which is the whole point of centring the globe on the operator.
{
  const fm17 = toLatLon('FM17');
  const home = basis(fm17.lon, fm17.lat);
  check('FM17 faces the viewer from home', project(toVec(fm17.lon, fm17.lat), home).depth, 1, 1e-12);
  const b = basis(0, 0);
  check('FM17 is left of centre from 0,0', project(toVec(fm17.lon, fm17.lat), b).sx < 0, true);
  check('FM17 is above centre from 0,0', project(toVec(fm17.lon, fm17.lat), b).sy > 0, true);
}

// --- rotation arithmetic ----------------------------------------------------
check('wrap 190', wrapLon(190), -170, TOL);
check('wrap -190', wrapLon(-190), 170, TOL);
check('wrap 180', wrapLon(180), -180, TOL);
check('wrap 0', wrapLon(0), 0, TOL);
check('short way east', shortestLon(170, -170), 20, 1e-12);
check('short way west', shortestLon(-170, 170), -20, 1e-12);

// Dragging right must bring what is to the west into view, and dragging down
// must bring the north into view. Both signs are easy to get backwards and
// both feel obviously wrong on the device but obviously fine in code.
{
  const v = { lon0: 0, lat0: 0 };
  check('drag right looks west', rotateBy(v, 100, 0, 200).lon0 < 0, true);
  check('drag down looks north', rotateBy(v, 0, 100, 200).lat0 > 0, true);
  check('a radius is 90 degrees', rotateBy(v, 200, 0, 200).lon0, -90, 1e-12);
  check('latitude clamps at the pole', rotateBy(v, 0, 1000, 200).lat0, 90, TOL);
  check('latitude clamps at the other pole', rotateBy(v, 0, -1000, 200).lat0, -90, TOL);
}

check('ease starts at 0', ease(0), 0, TOL);
check('ease ends at 1', ease(1), 1, TOL);
check('ease is halfway at halfway', ease(0.5), 0.5, 1e-12);
check('ease clamps past the end', ease(2), 1, TOL);
{
  // Returning home from 170E to 170W goes 20 degrees east, not 340 west --
  // halfway is the antimeridian, which wrapLon names -180.
  const mid = interpolate({ lon0: 170, lat0: 0 }, { lon0: -170, lat0: 0 }, 0.5);
  check('return takes the short way', mid.lon0, -180, 1e-9);
  const end = interpolate({ lon0: 170, lat0: 10 }, { lon0: -170, lat0: 40 }, 1);
  check('return arrives at the longitude', end.lon0, -170, 1e-9);
  check('return arrives at the latitude', end.lat0, 40, 1e-9);
}

// --- the night region -------------------------------------------------------

/** Shoelace area of a unit-disc polygon. */
function area(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// Looking straight down on the subsolar point: all day, nothing to fill. This
// happens every local noon, so it is not an edge case, it is Tuesday.
check('sun overhead is all day', nightRegion(basis(0, 0), toVec(0, 0)).length, 0);

// And looking at the antipode of the sun: all night, the whole disc.
{
  const all = nightRegion(basis(180, 0), toVec(0, 0));
  check('sun behind fills the disc', area(all) > Math.PI * 0.99, true);
}

// Sun on the limb: the terminator runs through the centre of the disc and the
// night is exactly half of it, by symmetry. A closed form to check the stitch
// against, which the general case does not have.
for (const [lon0, lat0, sunLon, sunLat] of [
  [0, 0, 90, 0],
  [0, 0, -90, 0],
  [0, 0, 0, 90],
  [-77, 38, 13, 0],
]) {
  const b = basis(lon0, lat0);
  const sun = toVec(sunLon, sunLat);
  check(`sun on the limb is perpendicular ${lon0},${lat0}`, dot(sun, b.v), 0, 1e-12);
  check(`half the disc is dark from ${lon0},${lat0}`, area(nightRegion(b, sun, 720)), Math.PI / 2, 1e-3);
}

// The total check. For a spread of orientations and sun positions, every point
// of the visible disc must be inside the polygon exactly when the sun is below
// its horizon. This is what catches the wrong limb arc: taking the long way
// round produces a region of the right shape and the wrong half, and every
// other check here still passes.
{
  let tested = 0;
  let wrong = 0;
  for (const [lon0, lat0] of [[0, 0], [-77, 38], [140, -35], [0, 85], [30, -70]]) {
    const b = basis(lon0, lat0);
    for (const [sunLon, sunLat] of [
      [0, 0], [45, 23.4], [-120, -23.4], [175, 5], [-77, 38], [100, 0], [-30, -60],
    ]) {
      const sun = toVec(sunLon, sunLat);
      const poly = nightRegion(b, sun, 720);
      for (let i = 0; i < 40; i++) {
        for (let j = 0; j < 40; j++) {
          // A grid over the disc, skipping the rim where a sampled polygon and
          // a true circle legitimately differ by less than a pixel.
          const sx = -0.97 + (1.94 * i) / 39;
          const sy = -0.97 + (1.94 * j) / 39;
          const rr = sx * sx + sy * sy;
          if (rr > 0.94) continue;
          // Back to a point on the near side of the sphere.
          const d = Math.sqrt(1 - rr);
          const p = [
            sx * b.e[0] + sy * b.n[0] + d * b.v[0],
            sx * b.e[1] + sy * b.n[1] + d * b.v[1],
            sx * b.e[2] + sy * b.n[2] + d * b.v[2],
          ];
          tested++;
          if (inside(poly, sx, sy) !== (dot(p, sun) < 0)) wrong++;
        }
      }
    }
  }
  check('the fill classifies every visible point', wrong, 0);
  check('the check actually ran', tested > 30000, true);
}

// --- coastline preparation --------------------------------------------------
{
  const fake = { scale: 100, lines: [[0, 0, 9000, 0, 0, 9000], [1000, 1000, 1100, 1100]] };
  const prep = prepareCoastline(fake);
  check('one buffer per line', prep.length, 2);
  check('three vertices in the first', prep[0].length, 9);
  check('null island decodes to +x', [prep[0][0], prep[0][1], prep[0][2]].map(Math.round), [1, 0, 0]);
  check('90E decodes to +y', Math.round(prep[0][4]), 1);
  check('the pole decodes to +z', Math.round(prep[0][8]), 1);
  check('vertex count', vertexCount(prep), 5);

  // Every prepared vertex must be unit length, or the globe is subtly lumpy in
  // a way that reads as a projection bug rather than a decoding one.
  let worst = 0;
  for (const v of prep) {
    for (let i = 0; i < v.length; i += 3) {
      worst = Math.max(worst, Math.abs(Math.hypot(v[i], v[i + 1], v[i + 2]) - 1));
    }
  }
  check('prepared vertices are unit length', worst < 1e-6, true);
}

// Decimation must keep the ends. A coastline that loses its last vertex leaves
// a gap at the join, which on a closed island is a visible notch.
{
  const line = new Float32Array(3 * 10);
  for (let i = 0; i < 10; i++) {
    const v = toVec(i * 10, 0);
    line[3 * i] = v[0]; line[3 * i + 1] = v[1]; line[3 * i + 2] = v[2];
  }
  const short = new Float32Array(3 * 2);
  const coarse = decimate([line, short], 4);
  check('decimation keeps the first vertex', [coarse[0][0], coarse[0][1]], [line[0], line[1]]);
  check('decimation keeps the last vertex', coarse[0][coarse[0].length - 1], line[line.length - 1]);
  check('decimation thins the middle', coarse[0].length / 3 < 10, true);
  check('short lines are left alone', coarse[1].length, 6);
  check('stride 1 is a no-op', decimate([line], 1)[0].length, 30);
}

if (failures) {
  print(`\n${failures} check(s) failed.`);
  throw new Error('globe parity failed');
}
print('globe.js: all checks passed.');
