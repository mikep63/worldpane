// Maidenhead locator <-> latitude/longitude.
//
// The only location input Worldpane has. See DESIGN.md, "Settings exist, and
// location is still a grid square".
//
// A locator alternates letter and digit pairs, each pair subdividing the last:
//
//   pair 1  AA..RR  field       20 deg lon x 10 deg lat
//   pair 2  00..99  square       2 deg lon x  1 deg lat
//   pair 3  aa..xx  subsquare    5 min lon x  2.5 min lat
//   pair 4  00..99  extended    30 sec lon x 15 sec lat
//
// Longitude is halved throughout because the field grid is 18 wide over 360
// degrees but 18 tall over 180.

const FIELD = 18; // A..R
const SUB = 24; // a..x

// Width of one locator cell, in degrees, at 4/6/8 characters.
const CELL = {
  4: { lon: 2, lat: 1 },
  6: { lon: 2 / SUB, lat: 1 / SUB },
  8: { lon: 2 / SUB / 10, lat: 1 / SUB / 10 },
};

const A = 'A'.charCodeAt(0);
const LOWER_A = 'a'.charCodeAt(0);
const ZERO = '0'.charCodeAt(0);

/**
 * True if `s` is a well-formed 4, 6 or 8 character locator.
 * Case-insensitive; the conventional casing is FM17ax but nobody types it.
 */
export function isValid(s) {
  return /^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2})?)?$/i.test((s ?? '').trim());
}

/**
 * Locator -> { lat, lon } at the *centre* of the square.
 *
 * The centre matters: a 4-character locator is 176 km wide at mid latitudes,
 * and taking its corner would put sunrise up to 11 minutes out. Centring
 * halves the worst case and has no bias.
 *
 * Returns null rather than throwing, so callers can treat a bad stored value
 * the same as an absent one.
 */
export function toLatLon(locator) {
  const s = (locator ?? '').trim().toUpperCase();
  if (!isValid(s)) return null;

  // Accumulate the south-west corner, then add half a cell at the end.
  let lon = (s.charCodeAt(0) - A) * 20 - 180;
  let lat = (s.charCodeAt(1) - A) * 10 - 90;

  lon += (s.charCodeAt(2) - ZERO) * 2;
  lat += (s.charCodeAt(3) - ZERO) * 1;

  if (s.length >= 6) {
    lon += (s.charCodeAt(4) - A) * (2 / SUB);
    lat += (s.charCodeAt(5) - A) * (1 / SUB);
  }
  if (s.length === 8) {
    lon += (s.charCodeAt(6) - ZERO) * (2 / SUB / 10);
    lat += (s.charCodeAt(7) - ZERO) * (1 / SUB / 10);
  }

  const cell = CELL[s.length];
  return { lat: lat + cell.lat / 2, lon: lon + cell.lon / 2 };
}

/**
 * { lat, lon } -> locator, at `precision` characters (4, 6 or 8; default 6).
 *
 * Not used by the settings page, which asks the operator to type theirs. It
 * exists so a locator can be round-tripped in tests, and for the day something
 * needs to name the grid under the cursor.
 */
export function fromLatLon(lat, lon, precision = 6) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (!CELL[precision]) return null;

  // Normalise into [0, 360) and [0, 180), then clamp the poles so lat === 90
  // does not fall off the end of the last field.
  let x = (((lon + 180) % 360) + 360) % 360;
  let y = Math.min(Math.max(lat + 90, 0), 180 - 1e-9);

  let out =
    String.fromCharCode(A + Math.floor(x / 20)) +
    String.fromCharCode(A + Math.floor(y / 10));
  x %= 20;
  y %= 10;

  out += Math.floor(x / 2) + '' + Math.floor(y / 1);
  if (precision === 4) return out;
  x %= 2;
  y %= 1;

  // Subsquare letters are conventionally lower case: FM17ax, not FM17AX.
  out +=
    String.fromCharCode(LOWER_A + Math.floor(x * SUB / 2)) +
    String.fromCharCode(LOWER_A + Math.floor(y * SUB));
  if (precision === 6) return out;
  x = (x * SUB / 2) % 1;
  y = (y * SUB) % 1;

  return out + Math.floor(x * 10) + '' + Math.floor(y * 10);
}

/**
 * Approximate size of a locator cell in kilometres, for the settings page's
 * "6 characters is worth typing" note.
 */
export function cellSizeKm(locator) {
  const s = (locator ?? '').trim().toUpperCase();
  if (!isValid(s)) return null;
  const c = CELL[s.length];
  const { lat } = toLatLon(s);
  return {
    lon: c.lon * 111.32 * Math.cos((lat * Math.PI) / 180),
    lat: c.lat * 110.57,
  };
}

export { FIELD, SUB };
