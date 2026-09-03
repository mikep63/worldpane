// Parity checks for the pure formatters in js/render.js.
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
//     -m spec/check_render.mjs
//
// These are the parts that can be wrong silently: a duration that rounds the
// wrong way, or a stale reading that reads as fresh. The DOM functions in the
// same file are verified by looking at the page.

import {
  hhmm, ss, duration, age, greyLineText, nextPassText, compass, bearing,
  kpTrendText, trim,
} from '../js/render.js';

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

// Seconds are a separate element so they can be set smaller than the minutes.
check('seconds pad', ss(at('2026-08-28T07:05:03Z'), { utc: true }), ':03');
check('seconds top of minute', ss(at('2026-08-28T07:05:00Z'), { utc: true }), ':00');
check('seconds last', ss(at('2026-08-28T07:05:59Z'), { utc: true }), ':59');
check('seconds bad date', ss(new Date('nonsense'), { utc: true }), ':--');

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

// --- the satellite line -----------------------------------------------------
// Four states that have to read differently, because they mean different
// things. The one that matters most is the difference between the last two:
// an empty sky and no element sets are not the same news.

const t0 = new Date('2026-09-03T12:00:00Z');
const pass = (over) => ({
  label: 'AO-7',
  aos: new Date(t0.getTime() + 42 * 60000),
  los: new Date(t0.getTime() + 54 * 60000),
  peak: 47.4,
  inProgress: false,
  ...over,
});

check('a pass to come counts down to it',
  nextPassText(pass(), t0).text, 'AO-7 in 42 min, peak 47\u00b0');
check('and is not marked active', nextPassText(pass(), t0).active, false);

const running = pass({ aos: new Date(t0.getTime() - 5 * 60000), inProgress: true });
check('a pass under way says how long is left',
  nextPassText(running, t0).text, 'AO-7 up now, 54 min left, peak 47\u00b0');
check('and is marked active', nextPassText(running, t0).active, true);

check('an empty sky says so', nextPassText(null, t0).text, 'No pass above 10\u00b0 today');
check('no elements is a different message',
  nextPassText(null, t0, { haveElements: false }).text, 'Satellites unavailable');
check('and outranks the pass', nextPassText(pass(), t0, { haveElements: false }).text,
  'Satellites unavailable');

// Element age is deliberately silent until it starts to matter -- everything is
// hours old and saying so every minute would be noise, but a week is where the
// along-track error stops the countdown being one.
const fresh = new Date(t0.getTime() - 2 * 86400000);
const stale = new Date(t0.getTime() - 9 * 86400000);
check('fresh elements are not mentioned',
  nextPassText(pass(), t0, { elementsAt: fresh }).text, 'AO-7 in 42 min, peak 47\u00b0');
check('stale elements are',
  nextPassText(pass(), t0, { elementsAt: stale }).text.includes('elements 9 d old'), true);
// Including while a pass is running. DESIGN.md's "staleness is always visible"
// does not get a pass for the one moment the line is busiest -- elements that
// old are exactly when the countdown on screen might be wrong.
check('a pass under way still admits stale elements',
  nextPassText(running, t0, { elementsAt: stale }).text.includes('elements 9 d old'), true);

// Peak elevation is rounded, not truncated, and always carries its degree sign.
check('the peak rounds', nextPassText(pass({ peak: 12.6 }), t0).text.includes('peak 13\u00b0'), true);

// --- bearings ---------------------------------------------------------------
// The four cardinals, then the boundaries between points, which is where a
// rounding error hides. 11.25 degrees is exactly half a point.
check('due north', compass(0), 'N');
check('due east', compass(90), 'E');
check('due south', compass(180), 'S');
check('due west', compass(270), 'W');
check('north-north-east', compass(22.5), 'NNE');
check('just under half a point is still north', compass(11.24), 'N');
check('just over rounds up', compass(11.26), 'NNE');
check('the far side of the compass wraps to north', compass(354), 'N');
check('and 360 is north, not undefined', compass(360), 'N');
check('negative bearings wrap', compass(-90), 'W');
check('past a full turn wraps', compass(450), 'E');

// 241 is WSW, not SW: the points are 22.5 apart and SW is 225, WSW is 247.5.
// Worth pinning a bearing that sits near a boundary rather than on one.
check('a bearing carries number and word', bearing(241), '241\u00b0 WSW');
check('bearings round to whole degrees', bearing(241.6), '242\u00b0 WSW');
check('a bearing on the point itself', bearing(225), '225\u00b0 SW');
check('a missing bearing does not print NaN', bearing(undefined), '--');

if (failures) {
  print(`\n${failures} check(s) failed.`);
  throw new Error('render parity failed');
}
print('render.js: all checks passed.');
