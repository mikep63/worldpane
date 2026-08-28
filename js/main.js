// Orchestration: routing, timers, and the draw loop.
//
// Three cadences, chosen for what actually changes:
//   1 s    clocks
//   60 s   terminator and sun times -- the subsolar point moves 0.25 deg/min,
//          which is under a pixel and a half at this scale
//   15 min space weather, matching how often SWPC publishes

import { toLatLon, isValid } from './grid.js';
import { subsolarPoint, horizonEvents, greyLine, makeObserver } from './sun.js';
import { nightPolygon } from './terminator.js';
import { loadCoastline, projectCoastline, renderCoastline, drawNight, drawStation } from './map.js';
import { readAll } from './spacewx.js';
import * as settings from './settings.js';
import * as theme from './theme.js';
import * as render from './render.js';

const CLOCK_MS = 1000;
const MAP_MS = 60 * 1000;
const SWX_MS = 15 * 60 * 1000;

const state = {
  settings: settings.load(),
  coastline: null,   // raw file
  projected: null,   // projected to the current canvas size
  basemap: null,     // pre-painted coastline canvas
  swx: {},
  size: { w: 0, h: 0 },
};

// ---------- theme -----------------------------------------------------------

function applyTheme() {
  const here = toLatLon(state.settings.grid);
  theme.apply(theme.resolve(state.settings.theme, {
    date: new Date(),
    lat: here ? here.lat : undefined,
    lon: here ? here.lon : undefined,
  }));
}

/** Map colours live in CSS so the two can never drift apart. */
function mapColours() {
  const s = getComputedStyle(document.documentElement);
  return {
    day: s.getPropertyValue('--map-day').trim(),
    night: s.getPropertyValue('--map-night').trim(),
    coast: s.getPropertyValue('--map-coast').trim(),
    station: s.getPropertyValue('--station').trim(),
  };
}

// ---------- map -------------------------------------------------------------

const canvas = document.getElementById('map');

/**
 * Size the canvas to its box at device resolution.
 *
 * Returns true when the size changed, which is the signal to re-project the
 * coastline and repaint the basemap. Doing that on every frame would waste the
 * whole point of pre-painting.
 */
function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.parentElement.clientWidth;
  const cssH = Math.round(cssW / 2); // equirectangular is 2:1
  canvas.style.height = `${cssH}px`;
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (w === state.size.w && h === state.size.h) return false;
  canvas.width = w;
  canvas.height = h;
  state.size = { w, h };
  return true;
}

function rebuildBasemap() {
  if (!state.coastline) return;
  const c = mapColours();
  state.projected = projectCoastline(state.coastline, state.size.w, state.size.h);
  state.basemap = renderCoastline(state.size.w, state.size.h, state.projected, {
    stroke: c.coast,
    background: c.day,
  });
}

function drawMap(now) {
  if (!state.basemap) return;
  const { w, h } = state.size;
  const ctx = canvas.getContext('2d');
  const c = mapColours();
  const sub = subsolarPoint(now);

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(state.basemap, 0, 0);

  // Night over the top, at partial alpha so coastlines stay readable through
  // it -- an opaque fill would hide half the world, which is the half the
  // operator most wants to see when chasing a grey-line opening.
  ctx.save();
  ctx.globalAlpha = 0.62;
  drawNight(ctx, nightPolygon(sub, 720), w, h, c.night);
  ctx.restore();

  const here = toLatLon(state.settings.grid);
  if (here) {
    drawStation(ctx, here.lat, here.lon, w, h, {
      fill: c.station,
      stroke: c.day,
      radius: Math.max(4, Math.round(w / 260)),
    });
  }
  render.renderMapCaption(`Subsolar ${sub.lat.toFixed(1)}°, ${sub.lon.toFixed(1)}°`);
}

// ---------- ticks -----------------------------------------------------------

function tickClock() {
  render.renderClocks(new Date());
}

function tickMap() {
  const now = new Date();
  const here = toLatLon(state.settings.grid);
  if (!here) return;
  const obs = makeObserver(here.lat, here.lon);

  applyTheme();          // auto theme can flip at sunrise or sunset
  if (sizeCanvas()) rebuildBasemap();
  drawMap(now);

  render.renderSun({
    grid: state.settings.grid,
    events: horizonEvents(now, obs),
    greyLine: greyLine(now, obs),
    now,
  });
}

async function tickSpaceWeather() {
  state.swx = await readAll(state.swx);
  render.renderSpaceWeather(state.swx, new Date());
}

// ---------- routing ---------------------------------------------------------

function route() {
  const wantSettings =
    location.hash.startsWith('#/settings') || !settings.isConfigured(state.settings);

  document.getElementById('dashboard').hidden = wantSettings;
  document.getElementById('settings').hidden = !wantSettings;

  if (wantSettings) {
    render.fillSettings(state.settings);
    render.showGridError(null);
    document.getElementById('settings-intro').textContent = settings.isConfigured(state.settings)
      ? 'Your grid square is the only location this needs. It stays on this device.'
      : 'Worldpane needs your grid square before it can draw anything. It stays on this device.';
    // Only steal focus on first run; returning from the gear should not pop a
    // keyboard on a wall-mounted iPad.
    if (!settings.isConfigured(state.settings)) document.getElementById('f-grid').focus();
  } else {
    render.renderCallsign(state.settings.callsign);
    if (sizeCanvas()) rebuildBasemap();
    tickClock();
    tickMap();
    render.renderSpaceWeather(state.swx, new Date());
  }
}

function onSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const grid = form.grid.value.trim();
  if (!isValid(grid)) {
    render.showGridError(
      grid ? `“${grid}” is not a grid square. Try four, six or eight characters, like FM17ax.`
           : 'A grid square is needed — four, six or eight characters, like FM17ax.'
    );
    form.grid.focus();
    return;
  }
  state.settings = settings.save({
    grid,
    callsign: form.callsign.value,
    theme: form.theme.value,
  });
  location.hash = '#/';
  route();
}

// ---------- start -----------------------------------------------------------

async function start() {
  applyTheme();
  document.getElementById('settings-form').addEventListener('submit', onSubmit);
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => {
    if (sizeCanvas()) {
      rebuildBasemap();
      drawMap(new Date());
    }
  });

  route();

  try {
    state.coastline = await loadCoastline();
    sizeCanvas();
    rebuildBasemap();
  } catch (err) {
    // The map is the hero, but the clocks, sun times and space weather are all
    // still true without it. Say so in the one place there is room.
    render.renderMapCaption('Coastline unavailable');
    console.error('coastline load failed', err);
  }

  if (settings.isConfigured(state.settings)) {
    tickClock();
    tickMap();
    tickSpaceWeather();
  }

  setInterval(tickClock, CLOCK_MS);
  setInterval(() => settings.isConfigured(state.settings) && tickMap(), MAP_MS);
  setInterval(() => settings.isConfigured(state.settings) && tickSpaceWeather(), SWX_MS);

  // Coming back from sleep can be hours later; redraw rather than wait out the
  // interval with a stale terminator on screen.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && settings.isConfigured(state.settings)) {
      tickClock();
      tickMap();
    }
  });
}

start();
