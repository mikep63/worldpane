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
import * as globe from './globe.js';
import { readAll } from './spacewx.js';
import * as settings from './settings.js';
import * as theme from './theme.js';
import * as render from './render.js';

// The clock re-arms itself on each second boundary rather than on an interval;
// see scheduleClock.
const MAP_MS = 60 * 1000;
const SWX_MS = 15 * 60 * 1000;

// Globe only. A turned globe is left turned, and a display that runs for months
// has to put itself back: without this you walk into the shack and it is showing
// the Pacific because somebody -- or a cat, under Guided Access -- brushed it
// last Tuesday. Ninety seconds is long enough to study the far side and short
// enough that the wrong hemisphere is never the resting state.
const IDLE_MS = 90 * 1000;
const HOME_MS = 900;
// Every sixth vertex while a finger is down. See globe.decimate.
const DRAG_STRIDE = 6;

const state = {
  settings: settings.load(),
  coastline: null,   // raw file
  projected: null,   // projected to the current canvas size
  basemap: null,     // pre-painted coastline canvas
  swx: {},
  size: { w: 0, h: 0 },
  dpr: 1,
  globe: {
    prepared: null,  // unit vectors, resolution-independent
    coarse: null,    // the same, thinned for dragging
    view: { lon0: 0, lat0: 0 },
    dragging: false,
    pointerId: null,
    last: null,
    idleTimer: 0,
    anim: null,      // { from, to, start } while returning home
    raf: 0,
  },
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
    bg: s.getPropertyValue('--bg').trim(),
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
  state.dpr = dpr;
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

/**
 * Which projection is on screen.
 *
 * The flat map stays the default and the globe is opt-in, for the reason
 * DESIGN.md rejected the globe in the first place: a hemisphere hides the
 * far-side terminator, and rotating it to look is an interaction, not a glance.
 */
function drawMap(now) {
  if (state.settings.view === 'globe') drawGlobe(now);
  else drawFlat(now);
}

function drawFlat(now) {
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

// ---------- globe -----------------------------------------------------------

/** Where the globe rests: looking straight down on the operator. */
function globeHome() {
  const here = toLatLon(state.settings.grid);
  return here ? { lon0: here.lon, lat0: here.lat } : { lon0: 0, lat0: 0 };
}

/**
 * The disc, inside the same box the flat map uses.
 *
 * Deliberately not a squarer box. Keeping the 2:1 map area means switching
 * views does not move the numbers underneath -- but it also means the globe is
 * half the width of the flat map with empty flanks either side, which is the
 * honest cost of the projection and something to look at on the device before
 * deciding anything.
 */
function globeGeometry() {
  const { w, h } = state.size;
  const d = Math.min(w, h);
  return { cx: w / 2, cy: h / 2, r: d / 2 - Math.max(2, Math.round(d / 60)) };
}

function isHome(view) {
  const home = globeHome();
  return Math.abs(globe.shortestLon(view.lon0, home.lon0)) < 0.01
      && Math.abs(view.lat0 - home.lat0) < 0.01;
}

/** "38.0°N, 77.5°W" -- a turned globe has to say where it is looking. */
function bearings(view) {
  const ns = `${Math.abs(view.lat0).toFixed(1)}°${view.lat0 < 0 ? 'S' : 'N'}`;
  const ew = `${Math.abs(view.lon0).toFixed(1)}°${view.lon0 < 0 ? 'W' : 'E'}`;
  return `${ns}, ${ew}`;
}

function drawGlobe(now) {
  const g = state.globe;
  if (!g.prepared) return;
  const { w, h } = state.size;
  const ctx = canvas.getContext('2d');
  const c = mapColours();
  const sub = subsolarPoint(now);
  const { cx, cy, r } = globeGeometry();
  const b = globe.basis(g.view.lon0, g.view.lat0);
  // Full detail whenever the globe is still, which is nearly always.
  const lines = g.dragging || g.anim ? g.coarse : g.prepared;

  // The page background outside the disc, not the map's day colour: the globe
  // has to read as an object sitting on the page rather than a hole cut in it.
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, w, h);
  globe.fillDisc(ctx, cx, cy, r, c.day);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  globe.strokeCoastline(ctx, lines, b, cx, cy, r, {
    stroke: c.coast,
    lineWidth: Math.max(1, state.dpr - 0.5),
  });
  // The same 0.62 as the flat map, for the same reason: coastlines have to stay
  // readable through the night side, because that is the half being watched.
  ctx.globalAlpha = 0.62;
  globe.fillNight(ctx, globe.nightRegion(b, globe.toVec(sub.lon, sub.lat), 180), cx, cy, r, c.night);
  ctx.restore();

  globe.strokeLimb(ctx, cx, cy, r, c.coast, Math.max(1, state.dpr));

  const here = toLatLon(state.settings.grid);
  if (here) {
    globe.drawStation(ctx, here.lat, here.lon, b, cx, cy, r, {
      fill: c.station,
      stroke: c.day,
      radius: Math.max(4, Math.round(w / 260)),
    });
  }

  const subsolar = `Subsolar ${sub.lat.toFixed(1)}°, ${sub.lon.toFixed(1)}°`;
  render.renderMapCaption(isHome(g.view) ? subsolar : `${subsolar} · centred ${bearings(g.view)}`);
}

/** Coalesce drag redraws onto frames; a pointer can fire faster than the display. */
function requestDraw() {
  const g = state.globe;
  if (g.raf) return;
  g.raf = requestAnimationFrame(() => {
    g.raf = 0;
    drawMap(new Date());
  });
}

function animateHome() {
  const g = state.globe;
  if (!g.anim) return;
  const t = (performance.now() - g.anim.start) / HOME_MS;
  g.view = globe.interpolate(g.anim.from, g.anim.to, t);
  // Cleared before the last draw, so the frame that lands is the detailed one.
  if (t >= 1) g.anim = null;
  drawMap(new Date());
  if (g.anim) requestAnimationFrame(animateHome);
}

function armIdleReturn() {
  const g = state.globe;
  clearTimeout(g.idleTimer);
  g.idleTimer = setTimeout(() => {
    if (state.settings.view !== 'globe' || g.dragging || isHome(g.view)) return;
    g.anim = { from: { ...g.view }, to: globeHome(), start: performance.now() };
    requestAnimationFrame(animateHome);
  }, IDLE_MS);
}

function onPointerDown(event) {
  const g = state.globe;
  if (state.settings.view !== 'globe' || !g.prepared) return;
  g.anim = null;
  clearTimeout(g.idleTimer);
  g.dragging = true;
  g.pointerId = event.pointerId;
  g.last = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add('dragging');
  event.preventDefault();
}

function onPointerMove(event) {
  const g = state.globe;
  if (!g.dragging || event.pointerId !== g.pointerId) return;
  // The drag arrives in CSS pixels and the canvas is in device pixels.
  const radiusCss = globeGeometry().r / state.dpr;
  g.view = globe.rotateBy(g.view, event.clientX - g.last.x, event.clientY - g.last.y, radiusCss);
  g.last = { x: event.clientX, y: event.clientY };
  requestDraw();
  event.preventDefault();
}

function onPointerUp(event) {
  const g = state.globe;
  if (!g.dragging || event.pointerId !== g.pointerId) return;
  g.dragging = false;
  g.pointerId = null;
  g.last = null;
  canvas.classList.remove('dragging');
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  drawMap(new Date()); // back to full detail
  armIdleReturn();
}

// ---------- ticks -----------------------------------------------------------

function tickClock() {
  render.renderClocks(new Date());
}

/**
 * Re-arm the clock on the next second boundary rather than every 1000 ms.
 *
 * setInterval drifts -- the browser only promises "not before" -- and the error
 * accumulates. With minutes on screen nobody could tell; with seconds showing,
 * a drifted timer visibly skips a second or holds one for two ticks. Measuring
 * the remainder each time makes the display self-correcting no matter how long
 * a frame took or how long the tab was throttled.
 *
 * The small margin past the boundary avoids firing a millisecond early and
 * painting the second that is just ending.
 */
function scheduleClock() {
  tickClock();
  setTimeout(scheduleClock, 1000 - (Date.now() % 1000) + 8);
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
    canvas.classList.toggle('globe', state.settings.view === 'globe');
    canvas.setAttribute('aria-label', state.settings.view === 'globe'
      ? 'Rotatable globe with the day and night terminator'
      : 'World map with the day and night terminator');
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
    view: form.view.value,
  });
  // A new grid is a new home, and leaving the globe pointed at the old one
  // would be the first thing anybody noticed.
  state.globe.view = globeHome();
  state.globe.anim = null;
  clearTimeout(state.globe.idleTimer);
  location.hash = '#/';
  route();
}

// ---------- start -----------------------------------------------------------

async function start() {
  applyTheme();
  document.getElementById('settings-form').addEventListener('submit', onSubmit);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
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
    // Both views are prepared regardless of the setting: it is one pass over
    // 60,000 vertices at load, it makes switching instant, and unlike the flat
    // map's pixels these survive every resize.
    state.globe.prepared = globe.prepareCoastline(state.coastline);
    state.globe.coarse = globe.decimate(state.globe.prepared, DRAG_STRIDE);
    state.globe.view = globeHome();
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

  scheduleClock();
  setInterval(() => settings.isConfigured(state.settings) && tickMap(), MAP_MS);
  setInterval(() => settings.isConfigured(state.settings) && tickSpaceWeather(), SWX_MS);

  // Coming back from sleep can be hours later; redraw rather than wait out the
  // interval with a stale terminator on screen.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && settings.isConfigured(state.settings)) {
      tickClock();
      tickMap();
      if (state.settings.view === 'globe' && !isHome(state.globe.view)) armIdleReturn();
    }
  });
}

start();
