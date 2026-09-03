// Parity checks for js/spacewx.js.
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
//     -m spec/check_spacewx.mjs
//
// The network is not exercised -- the readers are three lines of shape-checking
// each around a fetch, and a wrong URL announces itself immediately. What is
// checked is the arithmetic that fails silently: a timestamp read in the wrong
// zone, and the bands that decide what colour a number is. Both look completely
// normal when wrong.

import { parseUtc, kpBand, xrayBand, bzBand } from '../js/spacewx.js';

let failures = 0;
function check(name, got, want, tol = 0) {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol
                                      : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    print(`FAIL ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
}

// --- timestamps -------------------------------------------------------------
// Two SWPC endpoints emit a bare date-time with no zone, and JavaScript reads
// one of those as *local*. On an iPad in Virginia that shifts every reading by
// four or five hours depending on the season, and the display looks entirely
// plausible while being wrong -- the worst failure available to something
// nobody is watching closely.
const bare = parseUtc('2026-09-03T20:00:00');
check('a bare timestamp is read as UTC', bare.getUTCHours(), 20);
check('and on the right day', bare.getUTCDate(), 3);

const zulu = parseUtc('2026-09-03T20:00:00Z');
check('an explicit Z agrees', zulu.getTime(), bare.getTime());
check('an offset is respected, not overridden',
  parseUtc('2026-09-03T20:00:00+02:00').getUTCHours(), 18);
check('SWPC space-separated form', parseUtc('2026-09-03 20:00:00') instanceof Date, true);

check('nonsense is null, not an Invalid Date', parseUtc('not a time'), null);
check('a missing timestamp is null', parseUtc(undefined), null);
check('a number is null', parseUtc(1757000000000), null);

// --- Kp ---------------------------------------------------------------------
// NOAA's own G-scale starts at Kp 5, so that is where storm begins. Boundaries
// get their own lines because an off-by-one at the edge is invisible.
check('quiet', kpBand(0), 'quiet');
check('still quiet at 3', kpBand(3.9), 'quiet');
check('unsettled at 4', kpBand(4), 'unsettled');
check('storm at 5, where the G-scale starts', kpBand(5), 'storm');
check('and above', kpBand(9), 'storm');
check('no reading is unknown', kpBand(null), 'unknown');

// --- X-ray ------------------------------------------------------------------
check('A class is quiet', xrayBand('A1.0'), 'quiet');
check('B class is quiet', xrayBand('B4.8'), 'quiet');
check('C class is unsettled', xrayBand('C2.1'), 'unsettled');
check('M class is a storm', xrayBand('M1.3'), 'storm');
check('X class is a storm', xrayBand('X9.0'), 'storm');
check('lower case still classifies', xrayBand('c2.1'), 'unsettled');
check('an empty class is unknown', xrayBand(''), 'unknown');
check('a missing class is unknown', xrayBand(null), 'unknown');

// --- Bz ---------------------------------------------------------------------
// The sign is the whole meaning. A northward field shuts the coupling off
// however strong it is, so a magnitude test would paint a strongly northward
// field as a storm -- which is the exact opposite of the truth, in the one
// colour a reader takes at face value from across the room.
check('strongly northward is quiet, not a storm', bzBand(15), 'quiet');
check('weakly northward is quiet', bzBand(2), 'quiet');
check('zero is quiet', bzBand(0), 'quiet');
check('a shade south is still quiet', bzBand(-2.9), 'quiet');
check('southward past -3 is unsettled', bzBand(-3), 'unsettled');
check('and stays unsettled to -8', bzBand(-7.9), 'unsettled');
check('past -8 is a storm', bzBand(-8), 'storm');
check('deeply southward is a storm', bzBand(-25), 'storm');
check('no reading is unknown', bzBand(null), 'unknown');
check('and a string is unknown, not coerced', bzBand('-9'), 'unknown');

// The three bands are the same three words, so a tile can be coloured by any of
// them without the stylesheet knowing which number it is looking at.
const bands = ['quiet', 'unsettled', 'storm', 'unknown'];
for (const [name, value] of [['kp', kpBand(6)], ['xray', xrayBand('X1')], ['bz', bzBand(-9)]]) {
  check(`${name} returns one of the shared band names`, bands.includes(value), true);
}

if (failures) {
  print(`\n${failures} check(s) failed.`);
  throw new Error('space weather parity failed');
}
print('spacewx.js: all checks passed.');
