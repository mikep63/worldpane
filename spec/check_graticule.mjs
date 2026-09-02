// Parity checks for js/graticule.js -- the generated Maidenhead field grid.
//
// The grid is arithmetic rather than data, which means it has no build step to
// validate it and no file to eyeball. These checks are the whole of its
// verification, so they close the loop against js/grid.js: every field letter
// the graticule labels must be the letter grid.js would derive for a point
// inside that field. Two independent pieces of code agreeing on 36 letters is
// what catches an axis being lettered backwards.
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
//     -m spec/check_graticule.mjs

import { graticule, fieldLabels, letter, LON_PER_FIELD, LAT_PER_FIELD } from '../js/graticule.js';
import { fromLatLon, FIELD } from '../js/grid.js';

let failures = 0;
function check(name, got, want, tol = 0) {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol
                                      : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    print(`FAIL ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
}

const g = graticule();
const meridians = g.lines.slice(0, FIELD);
const parallels = g.lines.slice(FIELD);

// --- shape ------------------------------------------------------------------
// scale 1 is what lets both renderers decode this with the file decoder.
check('scale is 1', g.scale, 1);
check('18 meridians and 17 parallels', g.lines.length, FIELD + (FIELD - 1));
check('field is 20 degrees of longitude', LON_PER_FIELD, 20);
check('field is 10 degrees of latitude', LAT_PER_FIELD, 10);

// --- meridians --------------------------------------------------------------
// One per field boundary, pole to pole, and none at +180: that is the same
// meridian as -180 and would double-stroke the seam on the globe.
meridians.forEach((run, i) => {
  const lons = new Set();
  for (let k = 0; k < run.length; k += 2) lons.add(run[k]);
  check(`meridian ${i} holds one longitude`, lons.size, 1);
  check(`meridian ${i} is on a field boundary`, run[0], -180 + i * 20, 1e-9);
  check(`meridian ${i} starts at the south pole`, run[1], -90, 1e-9);
  check(`meridian ${i} ends at the north pole`, run[run.length - 1], 90, 1e-9);
});
check('no meridian at +180', meridians.some((r) => r[0] === 180), false);

// --- parallels --------------------------------------------------------------
// The poles are points, not lines, so 17 rather than 19.
parallels.forEach((run, j) => {
  const lats = new Set();
  for (let k = 1; k < run.length; k += 2) lats.add(run[k]);
  check(`parallel ${j} holds one latitude`, lats.size, 1);
  check(`parallel ${j} is on a field boundary`, run[1], -80 + j * 10, 1e-9);
  check(`parallel ${j} starts at the date line`, run[0], -180, 1e-9);
  check(`parallel ${j} ends at the date line`, run[run.length - 2], 180, 1e-9);
});
check('no parallel at a pole',
      parallels.some((r) => Math.abs(r[1]) === 90), false);

// The equator and the prime meridian are field boundaries and must fall out of
// the arithmetic rather than being special-cased.
check('the equator is drawn', parallels.some((r) => r[1] === 0), true);
check('the prime meridian is drawn', meridians.some((r) => r[0] === 0), true);

// --- sampling ---------------------------------------------------------------
// The globe walks these as curves; the flat map does not care. Changing the
// step must move only the vertex count, never the geometry.
const coarse = graticule(10);
check('step does not change the line count', coarse.lines.length, g.lines.length);
check('step does not move a meridian', coarse.lines[3][0], meridians[3][0], 1e-9);
check('a finer step yields more points', graticule(1).lines[0].length > g.lines[0].length, true);
for (const run of g.lines) {
  for (let k = 0; k < run.length; k += 2) {
    if (run[k] < -180 || run[k] > 180 || run[k + 1] < -90 || run[k + 1] > 90) {
      check('every point is on the globe', `${run[k]},${run[k + 1]}`, 'in range');
      break;
    }
  }
}

// --- labels agree with grid.js ---------------------------------------------
// The check that matters. A graticule lettered backwards still looks like a
// grid; it stops looking right only when someone reads a field off it and it
// disagrees with the locator they typed into settings.
const labels = fieldLabels();
check('36 labels', labels.length, 2 * FIELD);
check('letters run A to R', [letter(0), letter(FIELD - 1)], ['A', 'R']);

for (const label of labels) {
  const locator = fromLatLon(label.lat, label.lon, 4);
  const which = label.edge === 'top' ? 0 : 1;
  check(`${label.edge} label at ${label.lon},${label.lat} names field ${locator}`,
        locator[which], label.text);
}

// And the operator's own grid, as the concrete case: FM17 is field FM, so the
// column labelled F and the row labelled M must bracket it.
const fm = fromLatLon(38.5, -77.5, 4);
check('38.5N 77.5W is in field FM', fm.slice(0, 2), 'FM');
check('an F column label exists', labels.some((l) => l.edge === 'top' && l.text === 'F'), true);
check('an M row label exists', labels.some((l) => l.edge === 'left' && l.text === 'M'), true);

if (failures) {
  print(`\n${failures} check(s) failed.`);
  throw new Error('graticule parity failed');
}
print('graticule.js: all checks passed.');
