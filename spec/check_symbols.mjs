// Parity checks for js/symbols.js.
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
//     -m spec/check_symbols.mjs
//
// Only phaseGeometry is checked. The canvas work either looks like a sun and a
// moon or it does not, and the only instrument for that is a person standing
// across the room -- but the number that decides which way round the crescent
// faces is arithmetic, and arithmetic that is wrong by a sign draws a waxing
// Moon all month without ever looking broken.

import { phaseGeometry } from '../js/symbols.js';

let failures = 0;
function check(name, got, want, tol = 0) {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol
                                      : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    print(`FAIL ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)} (tol ${tol})`);
  }
}

// --- the four phases anyone can look up -------------------------------------
// `ex` is the terminator ellipse's signed semi-axis: the terminator is a circle
// seen face-on at new and full, and edge-on -- a straight line -- at the
// quarters. `lit` is the illuminated fraction.
const cases = [
  ['new',           0,   1, 0,   false],
  ['first quarter', 90,  0, 0.5, false],
  ['full',          180, -1, 1,  false],
  ['last quarter',  270, 0, 0.5, true],
];
for (const [name, phase, ex, lit, waning] of cases) {
  const g = phaseGeometry(phase);
  check(`${name}: terminator axis`, g.ex, ex, 1e-12);
  check(`${name}: illuminated fraction`, g.lit, lit, 1e-12);
  check(`${name}: waning`, g.waning, waning);
}

// --- the light is on one side, then the other -------------------------------
// The mirror flips exactly at full. A waxing crescent is lit on the right and a
// waning one on the left, which is the northern-hemisphere naked-eye view and
// the reason this is a convention rather than a fact.
check('just before full is waxing', phaseGeometry(179.9).waning, false);
check('just after full is waning', phaseGeometry(180.1).waning, true);
check('a hair past new is waxing', phaseGeometry(0.1).waning, false);
check('a hair before new is waning', phaseGeometry(359.9).waning, true);

// --- crescent below the quarters, gibbous above -----------------------------
// The sign of `ex` is what turns one into the other, so it is worth stating
// rather than trusting: a crescent has the terminator bulging away from the lit
// limb, a gibbous towards it.
for (const phase of [20, 60, 300, 340]) {
  check(`${phase} deg is a crescent`, phaseGeometry(phase).ex > 0, true);
  check(`${phase} deg is less than half lit`, phaseGeometry(phase).lit < 0.5, true);
}
for (const phase of [120, 160, 200, 240]) {
  check(`${phase} deg is gibbous`, phaseGeometry(phase).ex < 0, true);
  check(`${phase} deg is more than half lit`, phaseGeometry(phase).lit > 0.5, true);
}

// --- the fraction is symmetric about full -----------------------------------
// Waxing and waning gibbous of the same age are equally lit; only the side
// differs. A sign error in `ex` would break this while leaving the four named
// phases above intact.
for (const d of [10, 45, 90, 135]) {
  const a = phaseGeometry(180 - d);
  const b = phaseGeometry(180 + d);
  check(`${d} deg either side of full are equally lit`, a.lit, b.lit, 1e-12);
  check(`${d} deg either side of full share a terminator axis`, a.ex, b.ex, 1e-12);
  check(`${d} deg either side of full differ in which limb`, a.waning !== b.waning, true);
}

// --- angles outside 0-360 ---------------------------------------------------
// Nothing in the app feeds it one, but a wrapped phase is exactly the sort of
// thing a future caller does, and silently drawing a new Moon would be a poor
// answer.
check('370 wraps to 10', phaseGeometry(370).lit, phaseGeometry(10).lit, 1e-12);
check('-90 wraps to 270', phaseGeometry(-90).waning, true);

if (failures) {
  print(`\n${failures} check(s) failed.`);
  throw new Error('symbol parity failed');
}
print('symbols.js: all checks passed.');
