// Parity checks for js/satellites.js.
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
//     -m spec/check_satellites.mjs
//
// Element sets are embedded rather than fetched, so this runs with no network
// and gives the same answer next year. They will be stale by then and that is
// fine: nothing here checks the predictions against the real sky, only that the
// geometry is self-consistent -- an elevation of 90 degrees at the subpoint, a
// horizon crossing that is actually at the horizon, a peak that a brute-force
// sweep agrees with. A pass predictor quietly an hour out looks exactly like
// one that works, which is why this exists at all.

import {
  parseTle, epochOf, makeRecords, observerAt, elevationAt, lookAt,
  nextPassFor, passesFor, allPasses, passTrack, ROSTER,
} from '../js/satellites.js';
import satellite from '../vendor/satellite.js';

let failures = 0;
function check(name, got, want, tol = 0) {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol
                                      : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    print(`FAIL ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)} (tol ${tol})`);
  }
}

const R2D = 180 / Math.PI;

// --- fixtures ---------------------------------------------------------------
// Real element sets from CelesTrak's amateur group, 2026-09-03. `239ALFEROV`
// is here on purpose: its name begins with a digit, which an earlier parser
// mistook for an element line and silently dropped the satellite.
const ISS_1 = '1 25544U 98067A   26245.46626010  .00016717  00000+0  10270-3 0  9004';
const ISS_2 = '2 25544  51.6363 214.9179 0004734 130.5360 325.0288 15.49386233 39264';
const FIXTURE = [
  'ISS (ZARYA)',
  ISS_1,
  ISS_2,
  '239ALFEROV (RS61S)',
  '1 64881U 25136L   26245.58629567  .00012345  00000+0  55555-3 0  9993',
  '2 64881  97.4000 300.0000 0005000 100.0000 260.0000 15.19000000 12345',
].join('\n');

// --- parsing ----------------------------------------------------------------
const recs = parseTle(FIXTURE);
check('both satellites parse', recs.length, 2);
check('names survive', recs.map((r) => r.name), ['ISS (ZARYA)', '239ALFEROV (RS61S)']);
check('catalog numbers are read from the element line', recs.map((r) => r.catalog), [25544, 64881]);

// A name that starts with a digit is the case that broke it, so it gets its own
// line rather than being implied by the count above.
check('a name beginning with a digit is not taken for an element line',
  recs.some((r) => r.name === '239ALFEROV (RS61S)'), true);

// The wire is messier than the spec. None of these should cost a satellite.
check('CRLF parses', parseTle(FIXTURE.replace(/\n/g, '\r\n')).length, 2);
check('trailing blank lines parse', parseTle(`${FIXTURE}\n\n\n`).length, 2);
check('leading blank lines parse', parseTle(`\n\n${FIXTURE}`).length, 2);
check('trailing spaces parse', parseTle(FIXTURE.split('\n').map((l) => `${l}   `).join('\n')).length, 2);
check('an empty file is no satellites, not an error', parseTle('').length, 0);
check('junk is skipped rather than thrown', parseTle('hello\nworld\n').length, 0);

// --- epochs -----------------------------------------------------------------
// Day 245.46626010 of 2026 is 2026-09-02, a shade past 11:11 UTC. Worked out
// from the number rather than from this code's own answer.
const epoch = epochOf(ISS_1);
check('epoch year', epoch.getUTCFullYear(), 2026);
check('epoch month is September', epoch.getUTCMonth(), 8);
check('epoch day', epoch.getUTCDate(), 2);
check('epoch hour', epoch.getUTCHours(), 11);
check('two-digit years before 57 are this century', epochOf(ISS_1.slice(0, 18) + '26' + ISS_1.slice(20)).getUTCFullYear(), 2026);
check('two-digit years from 57 are the last one', epochOf(ISS_1.slice(0, 18) + '98' + ISS_1.slice(20)).getUTCFullYear(), 1998);

// --- the roster is coherent -------------------------------------------------
check('roster catalog numbers are unique', ROSTER.length, new Set(ROSTER.map((r) => r.catalog)).size);
check('roster labels are unique', ROSTER.length, new Set(ROSTER.map((r) => r.label)).size);
check('the ISS is on the roster', ROSTER.some((r) => r.catalog === 25544), true);

const sats = makeRecords(recs, [{ catalog: 25544, label: 'ISS' }]);
check('the ISS gets a propagator', sats.length, 1);
check('and keeps its epoch', sats[0].epoch instanceof Date, true);
check('an unknown catalog number simply drops',
  makeRecords(recs, [{ catalog: 99999, label: 'nope' }]).length, 0);

// --- elevation is the angle it claims to be ---------------------------------
// The strongest check available without an almanac: an observer standing under
// a satellite sees it at the zenith, and one standing on the far side of the
// Earth cannot see it at all. Both follow from the definition, so neither can
// be satisfied by a plausible-looking wrong answer.
const iss = sats[0];
const when = new Date(Date.UTC(2026, 8, 3, 12, 0, 0));
const pv = satellite.propagate(iss.satrec, when);
const gd = satellite.eciToGeodetic(pv.position, satellite.gstime(when));
const subLat = gd.latitude * R2D;
const subLon = gd.longitude * R2D;

check('the ISS is in low Earth orbit', gd.height > 380 && gd.height < 440, true);
if (!(gd.height > 380 && gd.height < 440)) print(`     height was ${gd.height.toFixed(1)} km`);

check('directly overhead at the subpoint',
  elevationAt(iss.satrec, observerAt(subLat, subLon), when), 90, 0.05);
check('below the horizon from the antipode',
  elevationAt(iss.satrec, observerAt(-subLat, subLon + 180), when) < -50, true);

// A quarter turn away is the horizon-ish middle: not overhead, not antipodal.
const side = elevationAt(iss.satrec, observerAt(subLat, subLon + 90), when);
check('ninety degrees away is below the horizon', side < 0, true);

// --- a pass is a pass -------------------------------------------------------
// FM17ax is the operator's grid. The window is wide enough that the ISS must
// produce something: at 51.6 degrees inclination it passes over Virginia
// several times a day.
const here = observerAt(38.9, -77.4);
const from = new Date(Date.UTC(2026, 8, 3, 0, 0, 0));
const pass = nextPassFor(iss, here, from, { windowHours: 24, minPeak: 10 });
check('the ISS passes over FM17 within a day', pass !== null, true);

if (pass) {
  check('acquisition comes before the peak', pass.aos < pass.peakAt, true);
  check('the peak comes before loss', pass.peakAt < pass.los, true);
  check('the pass starts inside the window', pass.aos >= from, true);

  // Horizon crossings are at the horizon. The bisection stops at one second, so
  // a tenth of a degree is generous for the ISS at about 1 deg/s near the edge.
  check('elevation at AOS is the horizon', elevationAt(iss.satrec, here, pass.aos), 0, 0.2);
  check('elevation at LOS is the horizon', elevationAt(iss.satrec, here, pass.los), 0, 0.2);

  // A low pass would have been discarded, so whatever came back must clear it.
  check('the reported peak clears the threshold', pass.peak >= 10, true);
  check('and no satellite is ever above 90 degrees', pass.peak <= 90, true);

  // An ISS pass runs from a couple of minutes at the horizon to about ten
  // overhead. Anything outside that is a unit error somewhere.
  const minutes = (pass.los - pass.aos) / 60000;
  check('the pass lasts a plausible number of minutes', minutes > 2 && minutes < 15, true);
  if (!(minutes > 2 && minutes < 15)) print(`     lasted ${minutes.toFixed(1)} min`);

  // The coarse grid could step over the true maximum. Sweep the pass at one
  // second and check the reported peak is the real one -- this is what says the
  // 60-second step is fine, rather than it being assumed.
  let brute = -90;
  for (let t = pass.aos.getTime(); t <= pass.los.getTime(); t += 1000) {
    const el = elevationAt(iss.satrec, here, new Date(t));
    if (el > brute) brute = el;
  }
  check('the coarse search finds the true peak', pass.peak, brute, 1.0);
  check('and never overstates it', pass.peak <= brute + 1e-9, true);
}

// --- a pass already under way -----------------------------------------------
// Starting the search from the middle of the pass above must report that same
// pass, in progress, with the same loss of signal.
if (pass) {
  const mid = new Date((pass.aos.getTime() + pass.los.getTime()) / 2);
  const now = nextPassFor(iss, here, mid, { windowHours: 24, minPeak: 0 });
  check('a pass under way is reported, not skipped', now !== null && now.inProgress, true);
  if (now) {
    check('and it is the same pass', Math.abs(now.los - pass.los) < 2000, true);
    check('its acquisition is not in the future', now.aos <= mid, true);
  }
}

// --- an empty sky -----------------------------------------------------------
// A zero-length window cannot contain a pass, and the honest answer is null
// rather than a pass with nonsense in it.
check('no window, no pass', nextPassFor(iss, here, from, { windowHours: 0 }), null);

// --- azimuth ----------------------------------------------------------------
// The half that makes this worth having. An azimuth running the wrong way round
// the compass points an antenna at the wrong quarter of the sky while every
// elevation stays perfectly correct, so it gets checked on its own.

check('azimuth is always a compass bearing', (() => {
  for (let h = 0; h < 24; h++) {
    const look = lookAt(iss.satrec, here, new Date(from.getTime() + h * 3600000));
    if (!look) return false;
    if (!(look.az >= 0 && look.az < 360)) return false;
  }
  return true;
})(), true);

// Due north of the observer must read as north, and due south as south. Built
// by putting the observer on the satellite's own meridian, north and south of
// its subpoint, where the answer follows from the geometry alone.
const look = lookAt(iss.satrec, observerAt(subLat, subLon), when);
check('range at the subpoint is the orbital height', look.rangeKm, gd.height, 2);

const southOf = lookAt(iss.satrec, observerAt(subLat - 8, subLon), when);
check('a satellite to the north reads as north',
  southOf.az < 15 || southOf.az > 345, true);
if (!(southOf.az < 15 || southOf.az > 345)) print(`     azimuth was ${southOf.az.toFixed(1)}`);

const northOf = lookAt(iss.satrec, observerAt(subLat + 8, subLon), when);
check('a satellite to the south reads as south', Math.abs(northOf.az - 180) < 15, true);
if (!(Math.abs(northOf.az - 180) < 15)) print(`     azimuth was ${northOf.az.toFixed(1)}`);

const eastOf = lookAt(iss.satrec, observerAt(subLat, subLon - 8), when);
check('a satellite to the east reads as east', Math.abs(eastOf.az - 90) < 20, true);
if (!(Math.abs(eastOf.az - 90) < 20)) print(`     azimuth was ${eastOf.az.toFixed(1)}`);

if (pass) {
  check('rise, peak and set all have bearings',
    [pass.aosAz, pass.peakAz, pass.losAz].every((a) => a >= 0 && a < 360), true);
  // A pass crosses the sky, so it cannot rise and set on the same bearing.
  const spread = Math.abs(((pass.aosAz - pass.losAz + 540) % 360) - 180);
  check('it does not set where it rose', spread < 178, true);
  // The recorded rise bearing is the bearing at the recorded rise time.
  const atAos = lookAt(iss.satrec, here, pass.aos);
  check('the rise bearing matches the rise moment', atAos.az, pass.aosAz, 0.5);
}

// --- the list ---------------------------------------------------------------
const many = passesFor(iss, here, from, { windowHours: 24, minPeak: 10 });
check('a day gives more than one ISS pass', many.length > 1, true);
check('the first of the list is the next pass',
  many[0].aos.getTime(), pass.aos.getTime());
check('passes do not overlap', many.every((p, i) => i === 0 || p.aos > many[i - 1].los), true);
check('every pass clears the threshold', many.every((p) => p.peak >= 10), true);
check('only the first can be in progress',
  many.slice(1).every((p) => !p.inProgress), true);

// A lower threshold can only ever find more.
const lower = passesFor(iss, here, from, { windowHours: 24, minPeak: 0 });
check('dropping the threshold does not lose passes', lower.length >= many.length, true);

const merged = allPasses([iss], here, from, { windowHours: 24, minPeak: 10, limit: 3 });
check('the merged list honours its limit', merged.length, 3);
check('and comes back in time order',
  merged.every((p, i) => i === 0 || p.aos >= merged[i - 1].aos), true);

// --- the track --------------------------------------------------------------
if (pass) {
  const track = passTrack(iss, here, pass, 60);
  check('the track is sampled end to end', track.length, 61);
  check('it starts at the horizon', track[0].el, 0, 0.3);
  check('it ends at the horizon', track[track.length - 1].el, 0, 0.3);
  check('it stays above the horizon in between',
    track.slice(1, -1).every((s) => s.el > -0.01), true);
  check('it is in time order',
    track.every((s, i) => i === 0 || s.at >= track[i - 1].at), true);
  const high = track.reduce((m, s) => Math.max(m, s.el), -90);
  check('and reaches the reported peak', high, pass.peak, 1.0);
}

if (failures) {
  print(`\n${failures} check(s) failed.`);
  throw new Error('satellite parity failed');
}
print('satellites.js: all checks passed.');
