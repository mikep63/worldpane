// Parity checks for the pure formatters in js/render.js.
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
//     -m spec/check_render.mjs
//
// These are the parts that can be wrong silently: a duration that rounds the
// wrong way, or a stale reading that reads as fresh. The DOM functions in the
// same file are verified by looking at the page.

import { hhmm, duration, age, greyLineText, kpTrendText, trim } from '../js/render.js';

let failures = 0;
function check(name, got, want) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    failures++;
    print(`FAIL ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
}
const at = (iso) => new Date(iso);
const min = (n) => n * 60000;

// --- clocks -----------------------------------------------------------------
check('utc midnight', hhmm(at('2026-08-28T00:00:00Z'), { utc: true }), '00:00');
check('utc pads', hhmm(at('2026-08-28T07:05:00Z'), { utc: true }), '07:05');
check('utc last minute', hhmm(at('2026-08-28T23:59:00Z'), { utc: true }), '23:59');
check('bad date', hhmm(new Date('nonsense'), { utc: true }), '--:--');
check('not a date', hhmm(null), '--:--');

// --- durations --------------------------------------------------------------
check('under a minute is now', duration(20000), 'now');
check('rounds to nearest minute', duration(min(1.4)), '1 min');
check('47 minutes', duration(min(47)), '47 min');
check('just under two hours stays minutes', duration(min(119)), '119 min');
check('two hours becomes hours', duration(min(120)), '2 h');
check('rounds hours', duration(min(200)), '3 h');
check('two days becomes days', duration(min(60 * 48)), '2 d');

// --- staleness --------------------------------------------------------------
// Quiet while fresh: a display that always shows an age trains the reader to
// ignore it, so the words only appear once they mean something.
const now = at('2026-08-28T12:00:00Z');
check('fresh is silent', age(at('2026-08-28T11:40:00Z'), now), '');
check('44 minutes is still silent', age(at('2026-08-28T11:16:00Z'), now), '');
check('46 minutes speaks up', age(at('2026-08-28T11:14:00Z'), now), '46 min old');
check('three hours', age(at('2026-08-28T09:00:00Z'), now), '3 h old');
check('missing reading', age(null, now), 'no data');
// A clock skewed ahead of the server must not render a negative age.
check('future timestamp is silent', age(at('2026-08-28T12:05:00Z'), now), '');

// --- grey line --------------------------------------------------------------
check('no grey line', greyLineText(null, now),
      { text: 'No grey line here today', active: false });
check('grey line running', greyLineText({ active: true, end: at('2026-08-28T12:22:00Z') }, now),
      { text: 'Grey line now, for 22 min', active: true });
check('grey line coming', greyLineText(
        { active: false, start: at('2026-08-28T12:47:00Z'), end: at('2026-08-28T13:32:00Z') }, now),
      { text: 'Grey line in 47 min, lasting 45 min', active: false });

// --- Kp trend ---------------------------------------------------------------
check('kp falling', kpTrendText(2, 5), 'Kp, down from 5');
check('kp rising', kpTrendText(5, 2), 'Kp, up from 2');
check('kp steady', kpTrendText(2.33, 2.33), 'Kp, steady');
check('kp barely moved is steady', kpTrendText(2.3, 2.6), 'Kp, steady');
check('kp with no history', kpTrendText(2, null), 'Kp');
check('kp trims the previous value', kpTrendText(1, 3.67), 'Kp, down from 3.7');

// --- number trimming --------------------------------------------------------
check('integer loses the decimal', trim(2.0), '2');
check('one decimal kept', trim(1.33), '1.3');
check('rounds up', trim(3.67), '3.7');
check('zero', trim(0), '0');
check('not a number', trim(undefined), '--');

if (failures) {
  print(`\n${failures} check(s) failed.`);
  throw new Error('render parity failed');
}
print('render.js: all checks passed.');
