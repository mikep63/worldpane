// Parity checks for js/skyplot.js.
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
//     -m spec/check_skyplot.mjs
//
// Only the projection. Whether the drawing looks like a sky is a question for
// eyes, but whether north is up and east is right is arithmetic -- and an
// azimuth running the wrong way round the compass draws a perfectly plausible
// arc over the wrong quarter of the sky. That is the failure this exists for:
// it does not look broken, it just points the antenna at the wrong place.

import { polar, RINGS, CARDINALS } from '../js/skyplot.js';

let failures = 0;
function check(name, got, want, tol = 0) {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol
                                      : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    print(`FAIL ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)} (tol ${tol})`);
  }
}

const TOL = 1e-12;

/** Points compare component-wise: exact equality would be a test of rounding. */
function checkPoint(name, got, want, tol = TOL) {
  const ok = Math.abs(got.x - want.x) <= tol && Math.abs(got.y - want.y) <= tol;
  if (!ok) {
    failures++;
    print(`FAIL ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)} (tol ${tol})`);
  }
}

// --- the centre is the zenith -----------------------------------------------
// Straight up has no bearing, so every azimuth must land on the same point.
for (const az of [0, 45, 90, 180, 270, 359]) {
  const p = polar(az, 90);
  check(`zenith x at az ${az}`, p.x, 0, TOL);
  check(`zenith y at az ${az}`, p.y, 0, TOL);
}

// --- the rim is the horizon, and the compass runs the right way --------------
// These four are the whole check. North up, east right, south down, west left,
// which is the sky seen looking up with north away from you.
checkPoint('north is up',   polar(0, 0),   { x: 0, y: -1 });
checkPoint('east is right', polar(90, 0),  { x: 1, y: 0 });
checkPoint('south is down', polar(180, 0), { x: 0, y: 1 });
checkPoint('west is left',  polar(270, 0), { x: -1, y: 0 });

// Stated separately because a sign error that swapped east and west would still
// satisfy "the four cardinals are on the rim".
check('azimuth increases clockwise', polar(45, 0).x > 0 && polar(45, 0).y < 0, true);
check('north-east is the upper right', polar(45, 0).x, Math.SQRT1_2, TOL);
check('north-west is the upper left', polar(315, 0).x, -Math.SQRT1_2, TOL);

// --- elevation is linear from rim to centre ---------------------------------
for (const [el, radius] of [[0, 1], [30, 2 / 3], [45, 0.5], [60, 1 / 3], [90, 0]]) {
  const p = polar(0, el);
  check(`elevation ${el} sits at radius ${radius.toFixed(3)}`, Math.hypot(p.x, p.y), radius, TOL);
}

// Halfway up the sky is halfway in, which is what makes the rings readable as a
// scale rather than a decoration.
check('45 degrees is halfway to the centre', Math.hypot(...Object.values(polar(123, 45))), 0.5, TOL);

// --- below the horizon leaves the disc --------------------------------------
// Deliberately not clamped: the caller clips. Folding a negative elevation back
// onto the rim would invent a bearing an operator could act on.
check('below the horizon is outside the unit circle',
  Math.hypot(...Object.values(polar(200, -5))) > 1, true);
check('and further down is further out',
  Math.hypot(...Object.values(polar(200, -20))) > Math.hypot(...Object.values(polar(200, -5))), true);

// --- azimuth wraps ----------------------------------------------------------
for (const [a, b] of [[0, 360], [10, 370], [350, -10]]) {
  checkPoint(`az ${a} and ${b} are the same point`, polar(a, 20), polar(b, 20));
}

// --- the frame's own constants ----------------------------------------------
check('rings are inside the horizon and below the zenith',
  RINGS.every((el) => el > 0 && el < 90), true);
check('rings are in order', RINGS.slice().sort((a, b) => a - b), RINGS);
check('four cardinals', CARDINALS.length, 4);
check('cardinals are 90 degrees apart', CARDINALS.map((c) => c.az), [0, 90, 180, 270]);

if (failures) {
  print(`\n${failures} check(s) failed.`);
  throw new Error('sky plot parity failed');
}
print('skyplot.js: all checks passed.');
