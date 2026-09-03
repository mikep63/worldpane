// Band conditions, derived rather than predicted.
//
// This is NOT a propagation model. VOACAP is a propagation model: it takes an
// antenna, a power, two endpoints and a month, and returns a reliability. There
// is no browser port of it, it answers a planning question rather than a glance,
// and this file does not pretend otherwise. See DESIGN.md, "Band conditions are
// an inference, and say so".
//
// What this does is combine three numbers the display already has -- solar flux,
// the K index, and the sun's altitude at the operator's own grid -- into the
// rough judgement an operator makes anyway before turning the dial. Every
// threshold below is a **stated convention**, in the same sense as the grey
// line's +2/-8 and Bz's -3/-8: the physics is continuous and the boundaries are
// ours. The interface says "derived" for exactly this reason.
//
// Everything here is pure, so spec/check_bands.mjs can hold it to the shape of
// the physics: high bands need flux, low bands need darkness, and a geomagnetic
// storm cannot improve anything.

/**
 * The HF bands, with what each one needs.
 *
 * `needsSfi` is the old operator's rule of thumb for the highest band a given
 * solar flux will support -- 70 gets you 20 m, 90 opens 17 and 15, 120 brings
 * 12 in, 140 makes 10 reliable. It is folklore rather than a formula, but it is
 * folklore that matches decades of logbooks.
 *
 * `day` is which half of the clock the band prefers: +1 for the high bands that
 * live on F2 ionisation and die at night, -1 for the low bands that daylight
 * absorbs in the D layer, 0 for the two that work around the clock.
 */
export const BANDS = [
  { name: '80 m', mhz: 3.5, needsSfi: 0, day: -1 },
  { name: '40 m', mhz: 7.0, needsSfi: 0, day: -1 },
  { name: '30 m', mhz: 10.1, needsSfi: 70, day: 0 },
  { name: '20 m', mhz: 14.0, needsSfi: 70, day: 0 },
  { name: '17 m', mhz: 18.1, needsSfi: 90, day: 1 },
  { name: '15 m', mhz: 21.0, needsSfi: 100, day: 1 },
  { name: '12 m', mhz: 24.9, needsSfi: 120, day: 1 },
  { name: '10 m', mhz: 28.0, needsSfi: 140, day: 1 },
];

export const STATES = ['closed', 'poor', 'fair', 'good'];

// Not a rank, which is why it is not in STATES: a band nobody can rate is not
// a worse band than a closed one, it is a band with no answer. Anything asking
// for a ranking finds -1 in STATES and skips it, which is the behaviour wanted.
export const UNKNOWN = 'unknown';

// Daylight and darkness, by solar altitude at the grid. Used for the label
// only; the scoring below grades continuously rather than stepping at these.
const DAY_ABOVE = 10;
const NIGHT_BELOW = -6;

// Below this the sun is up but barely, and the D layer has not built. The
// difference between "daylight" and "low sun" in the reasons column.
const WEAK_SUN = 0.35;

// Fully dark, for absorption purposes, by the end of nautical twilight.
const DARK_BELOW = -12;

const D2R = Math.PI / 180;

/** Where the sun is, as one of three words. */
export function daylight(sunAltitude) {
  if (typeof sunAltitude !== 'number' || Number.isNaN(sunAltitude)) return 'unknown';
  if (sunAltitude > DAY_ABOVE) return 'day';
  if (sunAltitude < NIGHT_BELOW) return 'night';
  return 'grey line';
}

/**
 * How much daylight there is, 0 to 1.
 *
 * Both F2 ionisation and D-layer absorption scale roughly with the cosine of
 * the solar zenith angle, which is the sine of the altitude. Using it as a
 * factor rather than a threshold is the difference between a sun at 14 degrees
 * and one at 60 counting the same -- they did, and 80 m took the full noon
 * absorption penalty an hour after sunrise. The same cliff the flux test had.
 */
export function dayFactor(sunAltitude) {
  if (typeof sunAltitude !== 'number' || Number.isNaN(sunAltitude)) return 0;
  return Math.max(0, Math.sin(sunAltitude * D2R));
}

/** How dark it is, 0 to 1, complete by the end of nautical twilight. */
export function nightFactor(sunAltitude) {
  if (typeof sunAltitude !== 'number' || Number.isNaN(sunAltitude)) return 0;
  return Math.max(0, Math.min(1, sunAltitude / DARK_BELOW));
}

/**
 * One band's state, and the reason for it.
 *
 * Scoring starts at neutral and moves. Flux decides whether a high band has a
 * ceiling to work with, the sun decides whether the band is in its own half of
 * the day, and geomagnetic activity only ever subtracts -- a storm has never
 * improved an HF path, so nothing here lets Kp add.
 */
export function bandState(band, { sfi, kp, sunAltitude }) {
  const light = daylight(sunAltitude);

  // No flux reading, and this band's fate depends on one. Saying "fair" would
  // be a guess and saying "good" would be a lie -- and it was saying good,
  // because the daylight bonus applied with nothing to offset it and a display
  // that had lost NOAA cheerfully announced that 10 m was open.
  if (typeof sfi !== 'number' && band.needsSfi > 0) {
    return { name: band.name, mhz: band.mhz, state: UNKNOWN, why: ['no flux reading'] };
  }

  let score = 0;
  const why = [];

  // Flux is graded, not a switch. A band two points short of its rule of thumb
  // is marginal; one seventy points short is not there at all. An earlier
  // version tested `sfi < needsSfi` and flipped 12 m between closed and fair
  // across a single point of flux, which is a cliff the ionosphere does not
  // have.
  let fluxStarved = false;
  if (typeof sfi === 'number' && band.needsSfi > 0) {
    const margin = sfi - band.needsSfi;
    if (margin >= 30) {
      score += 1;
      why.push(`well past the ${band.needsSfi} flux it wants`);
    } else if (margin >= 0) {
      score += 0.5;
      why.push(`just past the ${band.needsSfi} flux it wants`);
    } else if (margin >= -20) {
      score -= 0.5;
      why.push(`short of the ${band.needsSfi} flux it wants`);
    } else {
      fluxStarved = true;
      score -= 1.5;
      why.push(`far short of the ${band.needsSfi} flux it wants`);
    }
  }

  const day = dayFactor(sunAltitude);
  const night = nightFactor(sunAltitude);

  if (band.day !== 0 && light !== 'unknown') {
    if (band.day > 0) {
      // High bands live on F2 ionisation: the sun builds it and its absence
      // takes it away, both in proportion rather than at a threshold.
      if (!fluxStarved && day > 0) {
        score += day;
        why.push(day >= WEAK_SUN ? 'daylight here' : 'low sun here');
      }
      if (night > 0) {
        score -= night;
        why.push('dark here');
      }
    } else {
      // Low bands are the other way about: darkness lifts them and the D layer
      // absorbs them, again in proportion.
      if (night > 0) {
        score += night;
        why.push('darkness here');
      }
      if (day > 0) {
        score -= day;
        why.push(day >= WEAK_SUN ? 'daylight absorbs it here' : 'low sun, little absorption');
      }
    }
  } else if (light === 'grey line') {
    // The one time of day the low bands and the high bands overlap.
    why.push('grey line');
  }

  if (typeof kp === 'number') {
    if (kp >= 5) {
      score -= 1.25;
      why.push(`K ${kp} storm`);
    } else if (kp >= 4) {
      score -= 0.5;
      why.push(`K ${kp} unsettled`);
    }
  }

  return { name: band.name, mhz: band.mhz, state: stateFor(score), why };
}

/**
 * Score to word.
 *
 * Four buckets rather than a number, because a number implies a precision this
 * does not have. The boundaries were set by running the real range of inputs
 * and checking the spread was not all-or-nothing -- an earlier scoring put
 * almost every band on "good" or "closed" and never used the two words in
 * between, which made the whole table less informative than the flux figure it
 * was derived from.
 */
function stateFor(score) {
  if (score >= 1) return 'good';
  // Neutral is fair, not poor. A band with nothing said for or against it --
  // 80 m at the grey line, where neither the day rule nor the night rule
  // applies -- should read as ordinary, and an earlier boundary at +0.25 was
  // quietly marking every such band down.
  if (score >= -0.25) return 'fair';
  if (score >= -1.25) return 'poor';
  return 'closed';
}

/** Every band, in frequency order. */
export function bandStates(conditions) {
  return BANDS.map((band) => bandState(band, conditions));
}

/**
 * The band to try first, or null when nothing is better than poor.
 *
 * Highest frequency among the best-scoring, because the higher band is the one
 * that costs less power and less antenna for the same contact -- and because
 * when 10 m and 40 m are both "good", 10 m is the interesting news.
 */
export function bestBand(conditions) {
  const rated = bandStates(conditions);
  let best = null;
  for (const band of rated) {
    const rank = STATES.indexOf(band.state);
    if (rank < STATES.indexOf('fair')) continue;
    if (!best || rank >= STATES.indexOf(best.state)) best = band;
  }
  return best;
}
