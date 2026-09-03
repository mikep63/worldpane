// Parity checks for js/bands.js.
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
//     -m spec/check_bands.mjs
//
// There is nothing to check these numbers against -- they are a stated
// convention, not a measurement, and DESIGN.md says so. What can be checked is
// that the conventions behave the way propagation does: high bands need flux,
// low bands need darkness, a geomagnetic storm never helps, and the ordering
// holds however the inputs move. A model that got any of those backwards would
// still print a plausible-looking table.

import {
  BANDS, STATES, UNKNOWN, daylight, dayFactor, nightFactor,
  bandState, bandStates, bestBand,
} from '../js/bands.js';

let failures = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    print(`FAIL ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
}
const rank = (s) => STATES.indexOf(s);
const stateOf = (name, c) => bandStates(c).find((b) => b.name === name).state;

// --- the table itself -------------------------------------------------------
check('bands are in frequency order',
  BANDS.map((b) => b.mhz), BANDS.map((b) => b.mhz).slice().sort((a, b) => a - b));
check('every band has a state word', bandStates({ sfi: 100, kp: 2, sunAltitude: 30 })
  .every((b) => STATES.includes(b.state)), true);
check('unknown is not one of the ranked states', STATES.includes(UNKNOWN), false);
// The flux number itself belongs in the page header, not on all eight rows.
check('reasons do not repeat the flux figure',
  bandStates({ sfi: 108, kp: 2, sunAltitude: 45 })
    .every((b) => !b.why.some((w) => w.includes('108'))), true);

check('the flux each band wants never decreases with frequency',
  BANDS.every((b, i) => i === 0 || b.needsSfi >= BANDS[i - 1].needsSfi), true);

// --- daylight ---------------------------------------------------------------
check('high sun is day', daylight(45), 'day');
check('deep dark is night', daylight(-30), 'night');
check('just above the horizon is the grey line', daylight(0), 'grey line');
check('and just below it too', daylight(-4), 'grey line');
check('no sun angle is unknown', daylight(null), 'unknown');

// --- high bands need flux ---------------------------------------------------
// The whole point of the flux number. 10 m at flux 65 is not a band, whatever
// the time of day; at flux 200 in daylight it is the best thing on the dial.
const noon = { kp: 1, sunAltitude: 50 };
check('10 m is shut at low flux', stateOf('10 m', { ...noon, sfi: 65 }), 'closed');
check('10 m is good at high flux in daylight',
  rank(stateOf('10 m', { ...noon, sfi: 200 })) >= rank('good'), true);
check('more flux never makes a band worse',
  BANDS.every((b) => rank(stateOf(b.name, { ...noon, sfi: 200 })) >= rank(stateOf(b.name, { ...noon, sfi: 70 }))),
  true);

// 80 m asks nothing of the flux at all -- it is a darkness band, and a solar
// minimum does not close it.
check('80 m does not depend on flux',
  stateOf('80 m', { ...noon, sfi: 65 }), stateOf('80 m', { ...noon, sfi: 200 }));

// --- the sun is a slope, not a step ------------------------------------------
// Absorption and ionisation both scale with the cosine of the solar zenith
// angle. Treating "day" as one thing made a sun at 14 degrees cost 80 m exactly
// what a sun at 60 does, which is an hour after sunrise being charged as noon.
check('the zenith is full daylight', dayFactor(90), 1);
check('the horizon is none', dayFactor(0), 0);
check('below the horizon is none', dayFactor(-20), 0);
check('halfway up is not half',  Math.abs(dayFactor(30) - 0.5) < 1e-9, true);
check('a low sun counts for little', dayFactor(14) < 0.3, true);
check('and much less than a high one', dayFactor(14) < dayFactor(60) / 2, true);

check('daylight is not darkness', nightFactor(20), 0);
check('nautical twilight is fully dark', nightFactor(-12), 1);
check('and deeper stays fully dark', nightFactor(-40), 1);
check('civil twilight is partly dark', nightFactor(-6) > 0 && nightFactor(-6) < 1, true);

// The consequence, stated on the band it matters for.
const lowSun = { sfi: 108, kp: 2, sunAltitude: 14 };
const highSun = { sfi: 108, kp: 2, sunAltitude: 60 };
check('80 m suffers less under a low sun than a high one',
  rank(stateOf('80 m', lowSun)) > rank(stateOf('80 m', highSun)), true);
check('and 15 m gains less from it',
  rank(stateOf('15 m', lowSun)) <= rank(stateOf('15 m', highSun)), true);

// --- low bands need darkness ------------------------------------------------
const midnight = { kp: 1, sunAltitude: -40, sfi: 120 };
const midday = { kp: 1, sunAltitude: 50, sfi: 120 };
check('40 m is better at night than at noon',
  rank(stateOf('40 m', midnight)) > rank(stateOf('40 m', midday)), true);
check('80 m is better at night than at noon',
  rank(stateOf('80 m', midnight)) > rank(stateOf('80 m', midday)), true);
check('15 m is better at noon than at midnight',
  rank(stateOf('15 m', midday)) > rank(stateOf('15 m', midnight)), true);
check('20 m does not care much either way',
  stateOf('20 m', midday), stateOf('20 m', midnight));

// --- a storm never helps ----------------------------------------------------
// The one direction the K index is allowed to move anything.
for (const band of BANDS) {
  const quiet = stateOf(band.name, { sfi: 130, kp: 1, sunAltitude: 30 });
  const storm = stateOf(band.name, { sfi: 130, kp: 7, sunAltitude: 30 });
  check(`${band.name}: a K 7 storm is never an improvement`,
    rank(storm) <= rank(quiet), true);
}
check('an unsettled K costs less than a storm',
  rank(stateOf('20 m', { sfi: 130, kp: 4, sunAltitude: 30 }))
  >= rank(stateOf('20 m', { sfi: 130, kp: 7, sunAltitude: 30 })), true);

// --- missing inputs ---------------------------------------------------------
// A display that has lost NOAA must not fill the gap with confidence. This was
// wrong once: with no flux reading at all the daylight bonus stood unopposed
// and the table announced that 10 m was good.
const blind = bandStates({ sunAltitude: 45 });
check('no inputs still yields a full table', blind.length, BANDS.length);
check('and nothing throws', blind.every((b) => typeof b.state === 'string'), true);
check('bands that need flux say they do not know',
  blind.filter((b) => b.state === UNKNOWN).map((b) => b.name),
  BANDS.filter((b) => b.needsSfi > 0).map((b) => b.name));
check('no band is called good without a flux reading',
  blind.some((b) => b.state === 'good'), false);
check('and no band is recommended', bestBand({ sunAltitude: 45 }), null);

// The low bands do not depend on flux, so they are still rateable without one.
check('80 m is still rated with no flux reading',
  STATES.includes(blind.find((b) => b.name === '80 m').state), true);

// --- the pick ---------------------------------------------------------------
const best = bestBand({ sfi: 200, kp: 1, sunAltitude: 50 });
check('a good day picks a band', best !== null, true);
check('and picks a high one', best && Number(best.mhz) >= 21, true);

// Ties break upward: when two bands are equally good the higher one is the
// news, and it is the one that costs less antenna for the same contact.
const tie = bestBand({ sfi: 200, kp: 1, sunAltitude: 50 });
const allGood = bandStates({ sfi: 200, kp: 1, sunAltitude: 50 })
  .filter((b) => b.state === tie.state);
check('the pick is the highest of its state',
  tie.mhz, Math.max(...allGood.map((b) => b.mhz)));

// A solar minimum midnight has no high bands and poor low ones; saying nothing
// is better than promoting a band that is not there.
const dead = bestBand({ sfi: 65, kp: 8, sunAltitude: 50 });
check('a dead band-plan returns null rather than a guess', dead, null);

if (failures) {
  print(`\n${failures} check(s) failed.`);
  throw new Error('band parity failed');
}
print('bands.js: all checks passed.');
