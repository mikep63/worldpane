// Amateur satellites: the roster, the TLE file, and the next pass overhead.
//
// Scope is deliberately one line of text. DESIGN.md, "Satellites are a
// countdown, not a panel": on an always-on display the glanceable question is
// "is anything coming over soon", and footprints, ground tracks and pass tables
// are all answers to questions you ask sitting down.
//
// SGP4 comes from satellite-js, vendored. Everything here is either parsing or
// a search over it, and both are pure enough to check under the jsc shell --
// which matters, because a pass predictor that is quietly an hour out looks
// exactly like a pass predictor that works.

import satellite from '../vendor/satellite.js';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const SOURCE = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle';

/**
 * The birds worth waiting for, by NORAD catalog number.
 *
 * Matched on catalog number and not on name: CelesTrak's names carry suffixes
 * that change, and "RS-44 & BREEZE-KM R/B" is one string today and might be
 * another next year. The number is the only stable handle.
 *
 * This is a hand-picked list and it **will** go stale -- birds fail, and the
 * amateur group has ninety-six entries of which most are beacons and cubesats
 * nobody works. AMSAT's status page is the authority on what is alive; this
 * file is one operator's shortlist and is meant to be edited.
 */
export const ROSTER = [
  { catalog: 25544, label: 'ISS' },        // voice repeater, APRS, SSTV
  { catalog: 27607, label: 'SO-50' },      // the FM workhorse
  { catalog: 7530,  label: 'AO-7' },       // 1974, still going in sunlight
  { catalog: 44909, label: 'RS-44' },      // linear, strong
  { catalog: 24278, label: 'FO-29' },      // linear, intermittent
  { catalog: 39444, label: 'AO-73' },      // FUNcube-1
  { catalog: 50466, label: 'XW-3' },       // CAS-9, linear
  { catalog: 53109, label: 'IO-117' },     // GreenCube digipeater, MEO
  { catalog: 61781, label: 'AO-123' },     // ASRTU-1
];

// A pass whose peak stays under this is not worth walking to the radio for --
// it is a couple of minutes of horizon noise. Reporting it would make the line
// say something almost every hour and mean nothing.
export const MIN_PEAK_DEG = 10;

// Coarse search step. The shortest amateur pass from horizon to horizon runs
// about five minutes, so a minute cannot step over one; anything found is then
// refined by bisection. Sixty seconds x 24 hours x nine satellites is around
// thirteen thousand propagations, which is well under a second even on an
// eight-year-old iPad.
const STEP_SEC = 60;
const REFINE_SEC = 1;
const WINDOW_HOURS = 24;

/**
 * Split a CelesTrak three-line TLE file into records.
 *
 * Tolerant on purpose: blank lines, trailing whitespace and CRLF all appear in
 * the wild, and a display that showed nothing because a file ended with an
 * extra newline would be a poor trade. Anything that does not look like a pair
 * of element lines is skipped rather than throwing.
 */
export function parseTle(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length);
  const out = [];
  for (let i = 0; i + 2 < lines.length; i++) {
    if (!isElementLine(lines[i + 1], 1) || !isElementLine(lines[i + 2], 2)) continue;
    const l1 = lines[i + 1];
    const catalog = Number.parseInt(l1.slice(2, 7).trim(), 10);
    if (!Number.isFinite(catalog)) continue;
    out.push({ name: lines[i].trim(), catalog, line1: l1, line2: lines[i + 2] });
    i += 2;
  }
  return out;
}

/**
 * Whether a line is TLE element line 1 or 2.
 *
 * Tested by shape rather than by first character alone, which is the bug this
 * function exists to have fixed: the amateur group contains `239ALFEROV
 * (RS61S)`, and a name beginning with a digit was being taken for an element
 * line and its satellite silently dropped. An element line is a lone digit,
 * then a space, then the catalog number, in sixty-nine columns.
 */
function isElementLine(line, which) {
  return typeof line === 'string'
    && line.length >= 60
    && line[0] === String(which)
    && line[1] === ' '
    && /^[ 0-9]{5}/.test(line.slice(2, 7));
}

/**
 * TLE epoch as a Date, from the element line.
 *
 * Needed because element sets age: SGP4 is a fit to a moment, and by a week out
 * the along-track error on a low orbit is minutes. The display says how old its
 * elements are for the same reason every other panel says how old its data is.
 */
export function epochOf(line1) {
  const yy = Number.parseInt(line1.slice(18, 20), 10);
  const doy = Number.parseFloat(line1.slice(20, 32));
  if (!Number.isFinite(yy) || !Number.isFinite(doy)) return null;
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return new Date(Date.UTC(year, 0, 1) + (doy - 1) * 86400000);
}

/** Roster entries paired with a propagator, in roster order. Unknown ones drop. */
export function makeRecords(records, roster = ROSTER) {
  const byCatalog = new Map(records.map((r) => [r.catalog, r]));
  const out = [];
  for (const entry of roster) {
    const tle = byCatalog.get(entry.catalog);
    if (!tle) continue;
    const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
    // satellite-js reports a bad element set in `error` rather than throwing.
    if (!satrec || satrec.error) continue;
    out.push({ ...entry, name: tle.name, satrec, epoch: epochOf(tle.line1) });
  }
  return out;
}

/** An observer for satellite-js, from degrees and metres. */
export function observerAt(lat, lon, heightM = 0) {
  return { latitude: lat * D2R, longitude: lon * D2R, height: heightM / 1000 };
}

/**
 * Where to point: azimuth and elevation in degrees, plus range in km.
 *
 * Azimuth is what makes this worth having over elevation alone -- "peak 47
 * degrees" says whether to bother and azimuth says which way to turn. Returns
 * null when the propagator fails, which is what a decayed or otherwise unusable
 * element set looks like from here: satellite-js hands back `false` for the
 * position rather than raising.
 */
export function lookAt(satrec, observer, date) {
  const pv = satellite.propagate(satrec, date);
  if (!pv || !pv.position) return null;
  const ecf = satellite.eciToEcf(pv.position, satellite.gstime(date));
  const look = satellite.ecfToLookAngles(observer, ecf);
  return {
    az: (look.azimuth * R2D + 360) % 360,
    el: look.elevation * R2D,
    rangeKm: look.rangeSat,
  };
}

/** Elevation alone, for the horizon search. */
export function elevationAt(satrec, observer, date) {
  const look = lookAt(satrec, observer, date);
  return look ? look.el : null;
}

/**
 * Bisect a horizon crossing between two times to the nearest second.
 *
 * Which way the satellite is going has to be worked out rather than assumed.
 * A rising crossing has the horizon later in the interval and a setting one has
 * it earlier, so a bisection written for one converges to the wrong end of the
 * other -- which is exactly what it did, putting loss of signal two and a half
 * degrees below the horizon while acquisition looked perfect.
 */
function refineCrossing(satrec, observer, before, after) {
  let lo = before;
  let hi = after;
  const first = elevationAt(satrec, observer, new Date(lo));
  const rising = first !== null && first < 0;
  while (hi - lo > REFINE_SEC * 1000) {
    const mid = lo + Math.round((hi - lo) / 2);
    const el = elevationAt(satrec, observer, new Date(mid));
    if (el === null) return rising ? hi : lo;
    if (rising === (el < 0)) lo = mid;
    else hi = mid;
  }
  // Either way, return the end that is above the horizon, so the reported pass
  // is contained by the sky rather than straddling it.
  return rising ? hi : lo;
}

/**
 * Every pass of one satellite in the window, in time order.
 *
 * A pass already under way counts and comes back with `inProgress` set: on a
 * wall display "up now, six minutes left" is worth more than the one after it.
 *
 * Azimuths are recorded at the three moments an operator actually uses -- where
 * it comes up, where it is highest, and where it goes down. Those three
 * bearings are the pass, as far as pointing an antenna goes.
 *
 * The peak is located on the coarse grid and reported from there. That is
 * accurate to a fraction of a degree for a minute step, which
 * spec/check_satellites.mjs proves rather than assumes by sweeping a whole pass
 * at one second and comparing.
 */
export function passesFor(sat, observer, from, {
  windowHours = WINDOW_HOURS, stepSec = STEP_SEC, minPeak = MIN_PEAK_DEG, limit = Infinity,
} = {}) {
  const start = from.getTime();
  const end = start + windowHours * 3600 * 1000;
  const step = stepSec * 1000;
  const out = [];

  let prevT = start;
  let prevLook = lookAt(sat.satrec, observer, from);
  if (!prevLook) return out;

  let aos = prevLook.el >= 0 ? start : null;
  let aosAz = prevLook.el >= 0 ? prevLook.az : null;
  let inProgress = aos !== null;
  let peak = prevLook.el >= 0 ? prevLook.el : -90;
  let peakAz = prevLook.az;
  let peakT = start;

  for (let t = start + step; t <= end && out.length < limit; t += step) {
    const look = lookAt(sat.satrec, observer, new Date(t));
    if (!look) break;

    if (aos === null && prevLook.el < 0 && look.el >= 0) {
      aos = refineCrossing(sat.satrec, observer, prevT, t);
      const at = lookAt(sat.satrec, observer, new Date(aos));
      aosAz = at ? at.az : look.az;
      peak = look.el;
      peakAz = look.az;
      peakT = t;
    } else if (aos !== null) {
      if (look.el > peak) { peak = look.el; peakAz = look.az; peakT = t; }
      if (prevLook.el >= 0 && look.el < 0) {
        const los = refineCrossing(sat.satrec, observer, prevT, t);
        if (peak >= minPeak) {
          const lost = lookAt(sat.satrec, observer, new Date(los));
          out.push({
            catalog: sat.catalog,
            label: sat.label,
            aos: new Date(aos),
            aosAz,
            los: new Date(los),
            losAz: lost ? lost.az : look.az,
            peak,
            peakAz,
            peakAt: new Date(peakT),
            inProgress,
          });
        }
        // Whatever comes next is a fresh pass, whether this one was reported or
        // dropped for being too low to walk to the radio for.
        aos = null;
        aosAz = null;
        peak = -90;
        inProgress = false;
      }
    }
    prevT = t;
    prevLook = look;
  }
  return out;
}

/** The next pass of one satellite, or null. */
export function nextPassFor(sat, observer, from, options = {}) {
  const [first] = passesFor(sat, observer, from, { ...options, limit: 1 });
  return first || null;
}

/**
 * Every pass across the roster, soonest first.
 *
 * `limit` caps the returned list, not the search: the window is walked in full
 * for each satellite and the merge is sorted, because the soonest pass of the
 * ninth bird can easily precede the second pass of the first.
 */
export function allPasses(sats, observer, from, { limit = 20, ...options } = {}) {
  const out = [];
  for (const sat of sats) out.push(...passesFor(sat, observer, from, options));
  out.sort((a, b) => a.aos - b.aos);
  return out.slice(0, limit);
}

/**
 * The arc a pass traces across the sky, for the polar plot.
 *
 * Sampled evenly between acquisition and loss rather than on a fixed cadence,
 * so a four-minute skim and a seventy-minute MEO pass both come back as a
 * smooth curve of the same vertex count.
 */
export function passTrack(sat, observer, pass, samples = 90) {
  const start = pass.aos.getTime();
  const span = pass.los.getTime() - start;
  const out = [];
  for (let i = 0; i <= samples; i++) {
    const at = new Date(start + (span * i) / samples);
    const look = lookAt(sat.satrec, observer, at);
    if (look) out.push({ at, az: look.az, el: look.el });
  }
  return out;
}

/** The soonest pass across the roster, or null if the sky is empty for a day. */
export function nextPass(sats, observer, from, options = {}) {
  let best = null;
  for (const sat of sats) {
    const pass = nextPassFor(sat, observer, from, options);
    if (!pass) continue;
    if (!best || pass.aos < best.aos) best = pass;
  }
  return best;
}

/**
 * Fetch the amateur element sets.
 *
 * Direct from CelesTrak: it sends `access-control-allow-origin: *`, so the
 * scheduled Action is still not needed. Sixteen kilobytes, and the caller is
 * expected to keep the last good copy rather than call this often.
 */
export async function fetchTle(url = SOURCE) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const records = parseTle(text);
  if (!records.length) throw new Error('no element sets in response');
  return { text, records, at: new Date() };
}
