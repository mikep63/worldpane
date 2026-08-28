// Turning state into the DOM.
//
// The formatters at the top are pure and checked in spec/check_render.mjs; the
// functions below them touch the document and are verified by looking at the
// page. Splitting them that way keeps the part that can be wrong silently --
// arithmetic on times -- under test.

import { kpBand, xrayBand } from './spacewx.js';

const $ = (id) => document.getElementById(id);

// ---------- pure formatters -------------------------------------------------

/** 24-hour clock. `utc` picks the zone; anything else is the device's own. */
export function hhmm(date, { utc = false } = {}) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '--:--';
  const h = utc ? date.getUTCHours() : date.getHours();
  const m = utc ? date.getUTCMinutes() : date.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * A duration in words, rounded the way someone reading across a room needs it.
 *
 * Minutes up to two hours, then hours. Below a minute it says "now" rather than
 * counting seconds -- a wall display that ticks down the last sixty seconds
 * invites staring at it, and the grey line does not begin that sharply anyway.
 */
export function duration(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'now';
  if (min < 120) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

/** How stale a reading is. Empty string when it is fresh enough not to matter. */
export function age(at, now = new Date()) {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) return 'no data';
  const ms = now - at;
  if (ms < 0) return '';
  if (ms < 45 * 60000) return '';
  return `${duration(ms)} old`;
}

/**
 * The grey-line line of text.
 *
 * Three states, because all three are worth different words: running now,
 * coming later, or not happening at all today -- which is the honest answer
 * inside the polar circles and must not be dressed up as a countdown.
 */
export function greyLineText(gl, now = new Date()) {
  if (!gl) return { text: 'No grey line here today', active: false };
  if (gl.active) {
    return { text: `Grey line now, for ${duration(gl.end - now)}`, active: true };
  }
  const lasts = duration(gl.end - gl.start);
  return { text: `Grey line in ${duration(gl.start - now)}, lasting ${lasts}`, active: false };
}

/** "Kp" alone says nothing; "Kp, down from 5" is the information. */
export function kpTrendText(value, previous) {
  if (typeof value !== 'number' || typeof previous !== 'number') return 'Kp';
  const delta = value - previous;
  if (Math.abs(delta) < 0.5) return 'Kp, steady';
  return `Kp, ${delta < 0 ? 'down' : 'up'} from ${trim(previous)}`;
}

/** Kp arrives as 1.33 or 3.67; a wall display wants 1.3, and 2 rather than 2.0. */
export function trim(n) {
  if (typeof n !== 'number') return '--';
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// ---------- DOM -------------------------------------------------------------

export function renderClocks(now) {
  $('utc').textContent = hhmm(now, { utc: true });
  $('local').textContent = hhmm(now);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  $('local-label').textContent = zone ? zone.split('/').pop().replace(/_/g, ' ') : 'Local';
}

export function renderSun({ grid, events, greyLine, now }) {
  $('grid-label').textContent = grid || '--';
  $('sunrise').textContent = events.sunrise ? hhmm(events.sunrise) : '—';
  $('sunset').textContent = events.sunset ? hhmm(events.sunset) : '—';
  const gl = greyLineText(greyLine, now);
  const el = $('greyline');
  el.innerHTML = '';
  el.append(...emphasise(gl.text));
  el.classList.toggle('active', gl.active);
}

/** Bold the duration inside the grey-line sentence without using innerHTML. */
function emphasise(text) {
  const parts = text.split(/(\d+\s?(?:min|h|d)\b|now\b)/g);
  return parts.map((p, i) => {
    if (i % 2 === 0) return document.createTextNode(p);
    const s = document.createElement('strong');
    s.textContent = p;
    return s;
  });
}

export function renderSpaceWeather(swx, now = new Date()) {
  setTile('flux', swx.flux, (v) => String(v), () => 'quiet');
  setTile('kp', swx.kp, (v) => trim(v), kpBand);
  setTile('xray', swx.xray, (v) => v, xrayBand);

  $('kp-trend').textContent = swx.kp && swx.kp.ok
    ? kpTrendText(swx.kp.value, swx.kp.previous)
    : 'Kp';

  // One age line for the group: they refresh together, so three would be noise.
  const times = ['flux', 'kp', 'xray']
    .map((k) => swx[k] && swx[k].at)
    .filter((d) => d instanceof Date);
  const oldest = times.length ? new Date(Math.min(...times)) : null;
  const failed = ['flux', 'kp', 'xray'].filter((k) => swx[k] && !swx[k].ok);
  const parts = [];
  if (oldest) parts.push(age(oldest, now) || `updated ${hhmm(oldest, { utc: true })}Z`);
  if (failed.length) parts.push(`${failed.join(', ')} unreachable`);
  $('swx-age').textContent = parts.join(' · ');
}

function setTile(id, entry, format, band) {
  const tile = $(`tile-${id}`);
  const el = $(id);
  if (!entry || entry.value === undefined || entry.value === null) {
    el.textContent = '--';
    tile.dataset.band = 'unknown';
    return;
  }
  el.textContent = format(entry.value);
  tile.dataset.band = entry.ok ? band(entry.value) : 'unknown';
}

export function renderCallsign(callsign) {
  $('callsign').textContent = callsign || '';
}

export function renderMapCaption(text) {
  $('map-caption').textContent = text;
}

/** Fill the settings form from stored settings. */
export function fillSettings(s) {
  $('f-grid').value = s.grid || '';
  $('f-callsign').value = s.callsign || '';
  for (const el of document.querySelectorAll('input[name="theme"]')) {
    el.checked = el.value === s.theme;
  }
}

export function showGridError(message) {
  const input = $('f-grid');
  const hint = $('grid-hint');
  if (message) {
    input.setAttribute('aria-invalid', 'true');
    hint.textContent = message;
    hint.classList.add('error');
  } else {
    input.removeAttribute('aria-invalid');
    hint.classList.remove('error');
    hint.innerHTML =
      'Four characters work. Six is better &mdash; a four-character square is ' +
      'about 176&nbsp;km across, which spreads sunrise over some eleven minutes.';
  }
}
