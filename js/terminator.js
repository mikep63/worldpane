// The day/night terminator, as a polygon over the night side.
//
// Everything here follows from the subsolar point. Solar altitude h at
// latitude phi with the sun at declination dec and hour angle H is
//
//     sin(h) = sin(phi) sin(dec) + cos(phi) cos(dec) cos(H)
//
// and the terminator is where h = 0, which rearranges to
//
//     tan(phi) = -cos(H) / tan(dec)
//
// so the boundary latitude is one arctangent per sampled longitude. No
// iteration, no ephemeris beyond the subsolar point sun.js already provides.

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

// At an equinox tan(dec) passes through zero and the boundary latitude runs
// away to the poles -- which is geometrically right, since the terminator
// becomes a pair of meridians. Holding declination a hair off zero keeps the
// arithmetic finite while moving the curve by far less than a pixel.
const MIN_DEC = 1e-6;

/**
 * Latitude of the terminator at `lonDeg`, for a sun at `decDeg` declination
 * whose subsolar meridian is `subsolarLonDeg`.
 */
export function terminatorLat(lonDeg, subsolarLonDeg, decDeg) {
  const dec = Math.abs(decDeg) < MIN_DEC ? Math.sign(decDeg || 1) * MIN_DEC : decDeg;
  const H = (lonDeg - subsolarLonDeg) * D2R;
  return Math.atan(-Math.cos(H) / Math.tan(dec * D2R)) * R2D;
}

/**
 * The night side as a closed polygon of [lon, lat] pairs, ready to fill.
 *
 * The curve is sampled across the full longitude range, then closed along
 * whichever pole is in darkness: the winter pole, which is the one opposite the
 * sun's declination. That closure is what makes it a fillable region rather
 * than a line, and it is also what makes polar night draw correctly without a
 * special case -- when the whole cap is dark, the curve simply never reaches it
 * and the fill covers everything to the pole.
 *
 * `steps` is how many longitude samples to take. 360 is one per degree, which
 * at 4.2 px per degree is finer than the display can show.
 */
export function nightPolygon(subsolar, steps = 360) {
  const { lat: dec, lon: subLon } = subsolar;
  const points = [];

  for (let i = 0; i <= steps; i++) {
    const lon = -180 + (360 * i) / steps;
    points.push([lon, terminatorLat(lon, subLon, dec)]);
  }

  // Sun north of the equator means the southern cap is dark, and vice versa.
  const darkPole = dec >= 0 ? -90 : 90;
  points.push([180, darkPole], [-180, darkPole]);
  return points;
}

/**
 * Fraction of the globe in darkness, by area, for `subsolar`.
 *
 * Exactly one half, always -- the terminator is a great circle. It is here
 * because it is a cheap, total check on the polygon: integrating the sampled
 * night region and getting 0.5 back means the curve, the pole closure and the
 * sign of the declination all agree. Anything else means one of them is wrong.
 */
export function nightFraction(subsolar, steps = 3600) {
  const { lat: dec, lon: subLon } = subsolar;
  let dark = 0;
  let total = 0;
  for (let i = 0; i < steps; i++) {
    const lon = -180 + (360 * (i + 0.5)) / steps;
    const boundary = terminatorLat(lon, subLon, dec) * D2R;
    // Area on a sphere goes as sin(lat), so the dark share of this meridian
    // strip is the sine of the boundary measured from the dark pole.
    dark += dec >= 0 ? Math.sin(boundary) + 1 : 1 - Math.sin(boundary);
    total += 2;
  }
  return dark / total;
}

/** True if the sun is above the horizon at (lat, lon) for this subsolar point. */
export function isDaylight(lat, lon, subsolar) {
  const boundary = terminatorLat(lon, subsolar.lon, subsolar.lat);
  return subsolar.lat >= 0 ? lat > boundary : lat < boundary;
}
