// Turning state into the DOM.
//
// The formatters at the top are pure and checked in spec/check_render.mjs; the
// functions below them touch the document and are verified by looking at the
// page. Splitting them that way keeps the part that can be wrong silently --
// arithmetic on times -- under test.

import { kpBand, xrayBand, bzBand } from './spacewx.js';
import * as skyplot from './skyplot.js';

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
 * Seconds, as ":07", to sit alongside hhmm rather than inside it.
 *
 * Kept separate so the display can set them smaller than the hours and
 * minutes. Folding them into one string would make the big number half again
 * as wide and cost legibility across a room, to show the digit that matters
 * least at that distance -- while still being there when you walk up to it.
 */
export function ss(date, { utc = false } = {}) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ':--';
  const s = utc ? date.getUTCSeconds() : date.getSeconds();
  return `:${String(s).padStart(2, '0')}`;
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
/**
 * The next-pass line of text.
 *
 * Four states, and the differences between them are the point. A pass under way
 * is the only one where the useful number is how long is *left*; one coming is
 * a countdown; nothing in a day is worth saying plainly rather than leaving the
 * line blank, which would read as broken; and no element sets at all is a
 * different failure from an empty sky and must not be dressed up as one.
 *
 * Peak elevation is always there because it is what decides whether to bother:
 * a 12-degree pass is a scratchy two minutes and a 70-degree one is easy.
 */
export function nextPassText(pass, now = new Date(), { haveElements = true, elementsAt = null } = {}) {
  if (!haveElements) return { text: 'Satellites unavailable', active: false };
  if (!pass) return { text: `No pass above 10\u00b0 today${staleNote(elementsAt, now)}`, active: false };
  const peak = `${Math.round(pass.peak)}\u00b0`;
  if (pass.inProgress) {
    return {
      text: `${pass.label} up now, ${duration(pass.los - now)} left, peak ${peak}${staleNote(elementsAt, now)}`,
      active: true,
    };
  }
  return {
    text: `${pass.label} in ${duration(pass.aos - now)}, peak ${peak}${staleNote(elementsAt, now)}`,
    active: false,
  };
}

// How old element sets have to be before the line admits it. Elsewhere the
// display says how old everything is; here it would be noise, because elements
// are always hours old and that is fine. A week is where SGP4's along-track
// error on a low orbit grows past a minute and the countdown stops being one.
const TLE_STALE_DAYS = 7;

/** " · elements 9 d old", or nothing at all while they are fresh enough. */
function staleNote(elementsAt, now) {
  if (!(elementsAt instanceof Date) || Number.isNaN(elementsAt.getTime())) return '';
  const days = (now - elementsAt) / 86400000;
  if (days < TLE_STALE_DAYS) return '';
  return ` \u00b7 elements ${duration(now - elementsAt)} old`;
}

// Sixteen points, which is as fine as a bearing spoken aloud ever gets. A
// rotator takes the number; a person turning a handheld Arrow takes "SSW".
const POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

/** A bearing in degrees as a compass point. */
export function compass(deg) {
  if (typeof deg !== 'number' || Number.isNaN(deg)) return '';
  const norm = ((deg % 360) + 360) % 360;
  return POINTS[Math.round(norm / 22.5) % 16];
}

/** "241\u00b0 SW" -- the number to dial and the word to say. */
export function bearing(deg) {
  if (typeof deg !== 'number' || Number.isNaN(deg)) return '--';
  return `${Math.round(((deg % 360) + 360) % 360)}\u00b0 ${compass(deg)}`;
}

/**
 * Hertz as megahertz, the way a frequency is written down.
 *
 * Up to four decimals, never fewer than three. Three is kilohertz resolution
 * and covers nearly everything; AO-7's beacon sits at 145.9775 and would lose
 * its last digit, which on a CW beacon is the difference between hearing it and
 * not. Trailing zeros past the third are dropped so the common case stays
 * short.
 */
export function mhz(hz) {
  if (typeof hz !== 'number' || !Number.isFinite(hz)) return '';
  const four = (hz / 1e6).toFixed(4);
  return four.endsWith('0') ? four.slice(0, -1) : four;
}

// The four space weather readings, in the order they are shown.
const SWX_KEYS = ['flux', 'kp', 'xray', 'wind'];

/**
 * The one caption under the space weather tiles.
 *
 * This is where "staleness is always visible" is actually implemented, so it is
 * pure and checked rather than living inside the DOM code. Four states, and the
 * first two were both silent before: an empty object -- the first fetch still
 * in flight -- printed nothing, and a total failure printed a comma-separated
 * list of internal key names.
 */
export function spaceWeatherCaption(swx = {}, now = new Date()) {
  const known = SWX_KEYS.filter((k) => swx[k]);
  const failed = SWX_KEYS.filter((k) => swx[k] && !swx[k].ok);
  const times = SWX_KEYS.map((k) => swx[k] && swx[k].at).filter((d) => d instanceof Date);
  const oldest = times.length ? new Date(Math.min(...times)) : null;

  const parts = [];
  if (oldest) parts.push(age(oldest, now) || `updated ${hhmm(oldest, { utc: true })}Z`);

  // Context rather than readings, and both were crowding a tile caption. They
  // belong together: the A index is the day's geomagnetic figure to Kp's three
  // hours, and the wind speed is what the Bz number is riding on.
  if (swx.kp && swx.kp.ok && typeof swx.kp.aRunning === 'number') {
    parts.push(`A ${Math.round(swx.kp.aRunning)}`);
  }
  if (swx.wind && swx.wind.ok && typeof swx.wind.speed === 'number') {
    parts.push(`wind ${swx.wind.speed} km/s`);
  }

  if (!known.length) parts.push('waiting for NOAA');
  else if (failed.length === SWX_KEYS.length) parts.push('NOAA unreachable');
  else if (failed.length) parts.push(`${failed.join(', ')} unreachable`);

  return parts.join(' \u00b7 ');
}

export function kpTrendText(value, previous) {
  // The A index used to ride along here. It moved to the group caption when the
  // strip went to four panes: at 270 points a tile caption has room for the
  // trend or the A index, not both, and the trend is the one carrying
  // information rather than a second reading.
  if (typeof value !== 'number' || typeof previous !== 'number') return 'Kp';
  const delta = value - previous;
  if (Math.abs(delta) < 0.5) return 'Kp, steady';
  return `Kp, ${delta < 0 ? 'down' : 'up'} from ${trim(previous)}`;
}

/**
 * Bz, signed, because the sign is the whole meaning.
 *
 * A northward field shuts the coupling off however strong it is, so "+4" and
 * "-4" are opposite news and a bare "4" is not news at all. The plus is
 * explicit for the same reason.
 */
export function bzText(bz) {
  if (typeof bz !== 'number' || Number.isNaN(bz)) return '--';
  return bz > 0 ? `+${trim(bz)}` : trim(bz);
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
  $('utc-sec').textContent = ss(now, { utc: true });
  // Local carries no seconds: UTC is the operating clock and the one worth
  // reading to the second, local answers "what time is it really".
  $('local').textContent = hhmm(now);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  $('local-label').textContent = zone ? zone.split('/').pop().replace(/_/g, ' ') : 'Local';
}

export function renderSun({ grid, events, greyLine, now }) {
  $('grid-label').textContent = grid || '--';
  // The link names the grid too, so it says where the passes are before you
  // follow it rather than after.
  $('passes-grid').textContent = grid || '--';
  $('sunrise').textContent = events.sunrise ? hhmm(events.sunrise) : '—';
  $('sunset').textContent = events.sunset ? hhmm(events.sunset) : '—';
  const gl = greyLineText(greyLine, now);
  const el = $('greyline');
  el.innerHTML = '';
  el.append(...emphasise(gl.text));
  el.classList.toggle('active', gl.active);
}

/** The satellite line, under the grey line. Same shape, same reasons. */
export function renderSatellite(pass, now = new Date(), options = {}) {
  const line = nextPassText(pass, now, options);
  const el = $('satpass');
  el.innerHTML = '';
  el.append(...emphasise(line.text));
  el.classList.toggle('active', line.active);
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
  setTile('bz', swx.wind, bzText, bzBand);

  $('kp-trend').textContent = swx.kp && swx.kp.ok
    ? kpTrendText(swx.kp.value, swx.kp.previous)
    : 'Kp';

  // One age line for the group: they refresh together, so four would be noise.
  $('swx-age').textContent = spaceWeatherCaption(swx, now);
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
  for (const el of document.querySelectorAll('input[name="view"]')) {
    el.checked = el.value === s.view;
  }
  $('f-overlays').checked = s.overlays;
  $('f-fields').checked = s.fields;
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

// ---------- passes ----------------------------------------------------------

/**
 * The pass list.
 *
 * Buttons rather than list items with click handlers, so the keyboard and
 * VoiceOver get this for free -- it is the one genuinely interactive surface in
 * the whole app and the cheapest place to not be careless.
 */
export function renderPassList(passes, selected, now = new Date(), onPick) {
  const list = $('pass-list');
  list.innerHTML = '';
  if (!passes.length) {
    const li = document.createElement('li');
    li.className = 'hint';
    li.textContent = 'No passes above 10\u00b0 in the next 24 hours.';
    list.append(li);
    return;
  }
  passes.forEach((pass, i) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-current', String(i === selected));
    if (pass.inProgress || (pass.aos <= now && now <= pass.los)) button.classList.add('now');

    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = pass.inProgress ? 'now' : hhmm(pass.aos);

    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = pass.label;

    const how = document.createElement('span');
    how.className = 'how';
    how.textContent = `${Math.round(pass.peak)}\u00b0 ${compass(pass.peakAz)}`;

    button.append(when, who, how);
    button.addEventListener('click', () => onPick(i));
    li.append(button);
    list.append(li);
  });
}

/** The facts under the plot: the three bearings, and how long it lasts. */
export function renderPassFacts(pass) {
  const title = $('pass-title');
  const facts = $('pass-facts');
  facts.innerHTML = '';
  if (!pass) {
    title.textContent = 'No pass selected';
    return;
  }
  title.textContent = `${pass.label} \u00b7 ${hhmm(pass.aos)}\u2013${hhmm(pass.los)}`;
  const rows = [
    ['Rise', `${hhmm(pass.aos)} \u00b7 ${bearing(pass.aosAz)}`],
    ['Peak', `${hhmm(pass.peakAt)} \u00b7 ${Math.round(pass.peak)}\u00b0 at ${bearing(pass.peakAz)}`],
    ['Set', `${hhmm(pass.los)} \u00b7 ${bearing(pass.losAz)}`],
    ['Lasts', duration(pass.los - pass.aos)],
  ];
  for (const [term, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    facts.append(dt, dd);
  }
}

/**
 * Draw one pass on the polar plot.
 *
 * Sized here rather than in CSS because a canvas needs its backing store set in
 * device pixels; the element's own width comes from the stylesheet and this
 * follows it.
 */
export function renderSkyPlot(track, pass, colours) {
  const canvas = $('skyplot');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || 320;
  // Square, and with room outside the rim for the cardinal letters.
  canvas.style.height = `${cssW}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssW * dpr);

  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const fontPx = Math.max(12, Math.round(size / 24));
  const r = size / 2 - fontPx * 1.9;

  ctx.clearRect(0, 0, size, size);
  skyplot.drawFrame(ctx, cx, cy, r, { ring: colours.ring, label: colours.label, fontPx });
  if (!track || !track.length) return;

  skyplot.drawTrack(ctx, cx, cy, r, track, {
    stroke: colours.track,
    lineWidth: Math.max(2, Math.round(size / 150)),
  });
  const dot = Math.max(3.5, size / 90);
  skyplot.drawPoint(ctx, cx, cy, r, pass.aosAz, 0, {
    fill: colours.ends, halo: colours.bg, radius: dot,
  });
  skyplot.drawPoint(ctx, cx, cy, r, pass.losAz, 0, {
    fill: colours.ends, halo: colours.bg, radius: dot,
  });
  skyplot.drawPoint(ctx, cx, cy, r, pass.peakAz, pass.peak, {
    fill: colours.peak, halo: colours.bg, radius: dot * 1.35,
  });
}

/**
 * The transmitters for the selected satellite.
 *
 * Two lines each: what it is, then where it is. The description carries the
 * things that decide whether a contact happens at all -- the CTCSS tone on
 * SO-50, which band pair it is -- so it leads, and the frequencies sit under it
 * where a tabular column can align them.
 */
export function renderTransmitters(list) {
  const box = $('tx-list');
  box.innerHTML = '';
  if (!list || !list.length) {
    const li = document.createElement('li');
    li.className = 'hint';
    li.textContent = 'No published transmitters for this satellite.';
    box.append(li);
    return;
  }
  for (const tx of list) {
    const li = document.createElement('li');

    const what = document.createElement('p');
    what.className = 'tx-what';
    what.textContent = tx.description || tx.mode || 'Transmitter';
    if (tx.invert) {
      const tag = document.createElement('span');
      tag.className = 'tx-tag';
      // Which way a linear transponder runs. Tuning the wrong way sends you up
      // the band while the station you are working goes down it.
      tag.textContent = 'inverting';
      what.append(' ', tag);
    }

    const where = document.createElement('p');
    where.className = 'tx-where num';
    const parts = [];
    if (tx.uplink) parts.push(`\u2191 ${mhz(tx.uplink)}`);
    if (tx.downlink) parts.push(`\u2193 ${mhz(tx.downlink)}`);
    where.textContent = `${parts.join('   ')}  MHz`;

    li.append(what, where);
    box.append(li);
  }
}

// ---------- bands -----------------------------------------------------------

/**
 * The dashboard's band grid: eight cells, four across, coloured by state.
 *
 * The whole block is one link to the page that explains itself, because at
 * three metres nobody reads "good" and "poor" -- they read the pattern of
 * colour, and anyone close enough to want the reasoning is close enough to tap.
 *
 * The band number is the label. "80 m" would not fit four to a 270-point pane
 * and the metres are not in doubt.
 */
export function renderBandGrid(rated, best) {
  const grid = $('band-grid');
  grid.innerHTML = '';
  for (const band of rated) {
    const cell = document.createElement('span');
    cell.className = 'band-cell';
    cell.dataset.state = band.state;
    cell.textContent = band.name.replace(' m', '');
    // The colour is the whole message on screen, and a colour is not a message
    // to a screen reader, so each cell says its own state.
    cell.setAttribute('aria-label', `${band.name} ${band.state}`);
    grid.append(cell);
  }
  $('band-best').textContent = best ? `${best.name} best now` : 'nothing above poor';
}

/** The table: band, state, and the reasons that produced it. */
export function renderBands(rated, { sfi, kp, sunAltitude, light, grid }) {
  const inputs = [];
  inputs.push(typeof sfi === 'number' ? `Flux ${Math.round(sfi)}` : 'Flux unknown');
  inputs.push(typeof kp === 'number' ? `K ${trim(kp)}` : 'K unknown');
  if (typeof sunAltitude === 'number') {
    const where = grid ? ` at ${grid}` : '';
    inputs.push(`sun ${Math.round(sunAltitude)}\u00b0${where} \u2014 ${light}`);
  }
  // Showing the working, so a reader can disagree with the conclusion.
  $('band-inputs').textContent = `From ${inputs.join(' \u00b7 ')}.`;

  const list = $('band-list');
  list.innerHTML = '';
  for (const band of rated) {
    const li = document.createElement('li');

    const name = document.createElement('span');
    name.className = 'band-name';
    name.textContent = band.name;

    const state = document.createElement('span');
    state.className = 'band-state';
    state.dataset.state = band.state;
    state.textContent = band.state;

    const why = document.createElement('span');
    why.className = 'band-why';
    why.textContent = band.why.join(' \u00b7 ');

    li.append(name, state, why);
    list.append(li);
  }
}
