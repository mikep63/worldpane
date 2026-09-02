// The Maidenhead field grid, generated rather than downloaded.
//
// Eighteen fields of 20 degrees of longitude by ten of latitude, lettered A to
// R on both axes -- the first pair of any locator. See DESIGN.md, "Borders,
// lakes and a grid".
//
// This ships as zero bytes of data: it is arithmetic, and the whole layer is
// rebuilt at load in under a millisecond. It is also the only overlay here that
// is specific to the operator rather than to cartography, which is why it gets
// its own setting.
//
// The output deliberately wears the same shape as data/coastline.json --
// `{ scale, lines }` with flat lon,lat runs -- so both renderers consume it
// through the decoders they already have. `scale` is 1 because nothing needs
// quantising when the source is a formula.

import { FIELD } from './grid.js';

const LON_PER_FIELD = 360 / FIELD; // 20
const LAT_PER_FIELD = 180 / FIELD; // 10

const A = 'A'.charCodeAt(0);

/** Field letter for a column or row index: 0 -> 'A', 17 -> 'R'. */
export function letter(index) {
  return String.fromCharCode(A + index);
}

/**
 * The grid, as a coastline-shaped payload.
 *
 * `step` is the sampling interval in degrees. It exists for the globe: a
 * meridian is a great circle and a parallel is a small one, and both project to
 * curves that have to be walked. Three degrees keeps the worst chord under a
 * third of a pixel at this size. The flat map does not need the samples and
 * does not care, because it pays for them once into the basemap.
 *
 * Eighteen meridians, not nineteen: 180E and 180W are the same meridian on the
 * globe, and on the flat map the second one would land exactly on the canvas
 * edge. Seventeen parallels, not nineteen: the two at the poles are points.
 */
export function graticule(step = 3) {
  const lines = [];

  for (let i = 0; i < FIELD; i++) {
    const lon = -180 + i * LON_PER_FIELD;
    const run = [];
    for (let lat = -90; lat < 90; lat += step) run.push(lon, lat);
    run.push(lon, 90);
    lines.push(run);
  }

  for (let j = 1; j < FIELD; j++) {
    const lat = -90 + j * LAT_PER_FIELD;
    const run = [];
    for (let lon = -180; lon < 180; lon += step) run.push(lon, lat);
    run.push(180, lat);
    lines.push(run);
  }

  return { scale: 1, lines };
}

/**
 * Where the field letters go: along the top edge and down the left one.
 *
 * Not one label per cell. Three hundred and twenty-four two-letter labels would
 * be illegible at the three metres this display is designed for and noise at
 * any distance -- see DESIGN.md, "Legible across a room". The lines carry the
 * structure across the room; the letters are there for whoever walks up, and
 * two edges are enough to name any cell by reading across and down.
 *
 * Each label is positioned at the centre of its field along the relevant axis,
 * so it sits between two grid lines rather than on one.
 */
export function fieldLabels() {
  const out = [];
  for (let i = 0; i < FIELD; i++) {
    out.push({
      text: letter(i),
      lon: -180 + i * LON_PER_FIELD + LON_PER_FIELD / 2,
      lat: 90,
      edge: 'top',
    });
  }
  for (let j = 0; j < FIELD; j++) {
    out.push({
      text: letter(j),
      lon: -180,
      lat: -90 + j * LAT_PER_FIELD + LAT_PER_FIELD / 2,
      edge: 'left',
    });
  }
  return out;
}

export { LON_PER_FIELD, LAT_PER_FIELD };
