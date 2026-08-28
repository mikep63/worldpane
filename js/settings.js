// Operator settings, kept on the device.
//
// There is no account and no server, so there is nothing to sync and nothing to
// leak. See DESIGN.md, "Settings exist, and location is still a grid square".

import { isValid } from './grid.js';

const KEY = 'worldpane.settings.v1';

export const DEFAULTS = Object.freeze({
  callsign: '',
  grid: '',
  theme: 'auto', // 'auto' | 'light' | 'dark'
});

export const THEMES = ['auto', 'light', 'dark'];

/**
 * Read settings, merged over the defaults.
 *
 * Every access is wrapped: Safari throws on localStorage in private browsing
 * and when site data is blocked, and a display that refuses to start because it
 * could not read a preference would be a poor trade. A missing or corrupt store
 * is the same as an unconfigured one.
 */
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const stored = JSON.parse(raw);
    return sanitise({ ...DEFAULTS, ...stored });
  } catch {
    return { ...DEFAULTS };
  }
}

/** Merge `patch` into stored settings and persist. Returns the new settings. */
export function save(patch) {
  const next = sanitise({ ...load(), ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Nothing useful to do -- the session keeps working, it just will not be
    // remembered. Better than refusing the change.
  }
  return next;
}

/** Drop anything that would make the dashboard render wrongly. */
function sanitise(s) {
  return {
    callsign: typeof s.callsign === 'string' ? s.callsign.trim().toUpperCase().slice(0, 12) : '',
    grid: typeof s.grid === 'string' && isValid(s.grid) ? normaliseGrid(s.grid) : '',
    theme: THEMES.includes(s.theme) ? s.theme : DEFAULTS.theme,
  };
}

/** FM17ax: field upper, square digits, subsquare lower -- the conventional shape. */
export function normaliseGrid(g) {
  const s = g.trim();
  return (
    s.slice(0, 4).toUpperCase() +
    s.slice(4, 6).toLowerCase() +
    s.slice(6, 8)
  );
}

/**
 * Whether there is enough to draw a dashboard.
 *
 * Only the grid. A callsign is decoration and a theme has a default; without a
 * location there is nothing truthful to show, which is why first run opens the
 * settings page.
 */
export function isConfigured(s = load()) {
  return isValid(s.grid);
}
