// Sun geometry: the subsolar point that drives the terminator, the horizon
// events for the operator's grid, and the grey-line window.
//
// Real ephemeris work is delegated to astronomy-engine rather than hand-rolled,
// the same call the sibling repo makes (astrotonight-web/js/sunmoon.js). Its
// SearchAltitude does proper root-finding, so every time below is a solved
// crossing rather than a stepped scan.
import * as Astronomy from '../vendor/astronomy.js';

const { Body } = Astronomy;

// Grey line convention, from DESIGN.md: sun between 2 degrees above the
// horizon and 8 below. Brackets civil twilight, where D-layer absorption has
// decayed while the F layer is still ionised. The physics supplies no
// boundary, so these are a stated convention -- say so in the interface.
export const GREY_UPPER = 2;
export const GREY_LOWER = -8;

// Parallax on the Sun is about 9 arcseconds. One pixel of the map is roughly
// 26 km, or 840 arcseconds, so a geocentric observer is indistinguishable from
// a topocentric one here and saves carrying the operator's position into the
// terminator maths.
const GEOCENTRIC = new Astronomy.Observer(0, 0, 0);

export function makeObserver(latDeg, lonDeg) {
  return new Astronomy.Observer(latDeg, lonDeg, 0);
}

/**
 * Sun's altitude in degrees at `date`, seen from `observer`.
 *
 * **Geometric by default, not apparent.** Two conventions are in play here and
 * they differ by about a quarter of a degree near the horizon:
 *
 * - `SearchAltitude`, which every grey-line time below is solved with, works in
 *   geometric altitude. Measuring with refraction on would mean searching for
 *   one thing and checking another -- asking for 2 degrees lands at 2.28.
 * - Refraction bends the light an observer sees. It does not move the boundary
 *   of solar illumination in the ionosphere, which is what the grey line is
 *   actually about.
 *
 * Pass `'normal'` for the apparent altitude, which is the right one if a number
 * is ever shown next to what somebody can see out of the window.
 *
 * Note this is a different convention from `horizonEvents`, which uses
 * astronomy-engine's standard rise/set definition -- upper limb, refracted,
 * landing at about -0.83 degrees geometric. That inconsistency is deliberate:
 * each matches the convention its own term is normally quoted in.
 */
export function altitude(date, observer, refraction = null) {
  const eq = Astronomy.Equator(Body.Sun, date, observer, true, true);
  return Astronomy.Horizon(date, observer, eq.ra, eq.dec, refraction).altitude;
}

/**
 * The point on Earth with the Sun directly overhead, in degrees.
 *
 * This is the whole terminator: every place exactly 90 degrees away from it is
 * on the day/night boundary, so the map needs no other input.
 *
 * Declination gives the latitude directly. Longitude is the Sun's right
 * ascension measured back from Greenwich apparent sidereal time -- both are in
 * sidereal hours, so the difference scales by 15 to reach degrees.
 */
export function subsolarPoint(date) {
  const eq = Astronomy.Equator(Body.Sun, date, GEOCENTRIC, true, true);
  const gast = Astronomy.SiderealTime(date);
  return { lat: eq.dec, lon: normaliseLon((eq.ra - gast) * 15) };
}

/** Wrap to (-180, 180], the range the equirectangular projection expects. */
export function normaliseLon(deg) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Next sunrise and sunset at or after `date`, or null where the sun does not
 * cross the horizon within a day -- polar summer and winter both hit this, and
 * the interface has to say so rather than print a blank.
 */
export function horizonEvents(date, observer) {
  const rise = Astronomy.SearchRiseSet(Body.Sun, observer, +1, date, 1);
  const set = Astronomy.SearchRiseSet(Body.Sun, observer, -1, date, 1);
  return { sunrise: rise ? rise.date : null, sunset: set ? set.date : null };
}

// Earliest non-null of a list of astronomy-engine search results.
function earliest(...results) {
  return results
    .filter((r) => r)
    .map((r) => r.date)
    .sort((a, b) => a - b)[0] ?? null;
}

/**
 * Grey-line state at `date` for `observer`.
 *
 * Returns `{ active, start, end }`. When active, `start` is null -- the window
 * is already running and its beginning is history the display has no use for.
 * When inactive, both bounds of the next window are given so a countdown can
 * name how long until it opens and how long it will last.
 *
 * Returns null where the sun never enters the band within the next day, which
 * is the honest answer above the Arctic and Antarctic circles for much of the
 * year rather than a countdown to something that will not happen.
 */
export function greyLine(date, observer) {
  const alt = altitude(date, observer);

  if (alt <= GREY_UPPER && alt >= GREY_LOWER) {
    // Leaving the band means either sinking past the lower edge (dusk) or
    // climbing past the upper one (dawn); whichever comes first ends it.
    const end = earliest(
      Astronomy.SearchAltitude(Body.Sun, observer, -1, date, 1, GREY_LOWER),
      Astronomy.SearchAltitude(Body.Sun, observer, +1, date, 1, GREY_UPPER)
    );
    return end ? { active: true, start: null, end } : null;
  }

  // Entering the band is the mirror: descending through the top edge at dusk,
  // or ascending through the bottom edge at dawn.
  const start = earliest(
    Astronomy.SearchAltitude(Body.Sun, observer, -1, date, 1, GREY_UPPER),
    Astronomy.SearchAltitude(Body.Sun, observer, +1, date, 1, GREY_LOWER)
  );
  if (!start) return null;

  // Step a second inside the window before searching for its far edge, so the
  // crossing that opened it is not re-found as the one that closes it.
  const inside = new Date(start.getTime() + 1000);
  const end = earliest(
    Astronomy.SearchAltitude(Body.Sun, observer, -1, inside, 1, GREY_LOWER),
    Astronomy.SearchAltitude(Body.Sun, observer, +1, inside, 1, GREY_UPPER)
  );
  return end ? { active: false, start, end } : null;
}
