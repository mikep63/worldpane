// Light or dark, decided by the sun over the operator's grid.
//
// See DESIGN.md, "Theme is a setting, defaulting to auto". Auto uses the same
// sun calculation the map already performs, so the display matches the room
// without a light sensor and without another dependency.

import { altitude, makeObserver } from './sun.js';

// Switch at the horizon rather than at civil twilight. A shack at dusk still
// has daylight in it, and flipping to a dark palette while the room is bright
// is the more jarring of the two errors.
const SWITCH_ALTITUDE = 0;

/**
 * Resolve a theme setting to the palette to apply.
 *
 * `setting` is 'auto', 'light' or 'dark'. Auto needs a position; without one it
 * falls back to dark, which is the safer default for a display that might be in
 * an unlit room and is what the settings page shows against.
 */
export function resolve(setting, { date = new Date(), lat, lon } = {}) {
  if (setting === 'light' || setting === 'dark') return setting;
  if (typeof lat !== 'number' || typeof lon !== 'number') return 'dark';
  return altitude(date, makeObserver(lat, lon)) > SWITCH_ALTITUDE ? 'light' : 'dark';
}

/** Apply a resolved palette to the document. */
export function apply(palette) {
  document.documentElement.dataset.theme = palette;
}

export { SWITCH_ALTITUDE };
