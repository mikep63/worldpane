// Space weather from NOAA SWPC.
//
// Three endpoints, all CORS-open and tiny -- the flux one is 47 bytes. See
// DESIGN.md, "First slice". They are fetched directly rather than through the
// scheduled Action, which is insulation this does not need yet.
//
// Nothing here throws. A display that runs unattended for months will lose the
// network sometimes, and the honest response is to keep the last good reading
// and say how old it is, not to blank the panel or show an error dialog nobody
// is present to dismiss.

const BASE = 'https://services.swpc.noaa.gov';

const SOURCES = {
  flux: `${BASE}/products/summary/10cm-flux.json`,
  kp: `${BASE}/products/noaa-planetary-k-index.json`,
  xray: `${BASE}/json/goes/primary/xray-flares-latest.json`,
};

const TIMEOUT_MS = 15000;

/**
 * Parse a SWPC timestamp as UTC.
 *
 * Two of the three endpoints emit "2026-08-27T20:00:00" with no zone, and
 * JavaScript reads a bare date-time as *local*. On this iPad that would shift
 * every reading by four or five hours depending on the season, and the display
 * would look plausible while being wrong -- the worst kind of failure for
 * something nobody is watching closely.
 */
export function parseUtc(s) {
  if (typeof s !== 'string') return null;
  const iso = /[Zz]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function getJson(url) {
  // AbortController rather than Promise.race, so a hung socket is actually
  // released instead of being left running behind a resolved promise.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Solar flux: 10.7 cm radio flux, the number every propagation chart starts from. */
async function readFlux() {
  const d = await getJson(SOURCES.flux);
  const row = Array.isArray(d) ? d[0] : null;
  if (!row || typeof row.flux !== 'number') throw new Error('unexpected flux payload');
  return { value: Math.round(row.flux), at: parseUtc(row.time_tag) };
}

/**
 * Planetary K: the latest three-hour value, plus where it stood a day ago.
 *
 * The trend is the point. DESIGN.md's rule: "K 2, down from 5 overnight" is
 * information and "K 2" is trivia. The series arrives at three-hour spacing,
 * so eight rows back is 24 hours.
 */
async function readKp() {
  const d = await getJson(SOURCES.kp);
  if (!Array.isArray(d) || !d.length) throw new Error('unexpected kp payload');
  const rows = d.filter((r) => typeof r.Kp === 'number');
  if (!rows.length) throw new Error('no numeric Kp rows');

  const latest = rows[rows.length - 1];
  const dayAgo = rows[Math.max(0, rows.length - 9)];
  return {
    value: latest.Kp,
    at: parseUtc(latest.time_tag),
    previous: dayAgo === latest ? null : dayAgo.Kp,
    aRunning: typeof latest.a_running === 'number' ? latest.a_running : null,
  };
}

/** GOES X-ray: the current flux class, e.g. B4.8, C2.1, M1.3. */
async function readXray() {
  const d = await getJson(SOURCES.xray);
  const row = Array.isArray(d) ? d[0] : null;
  if (!row || typeof row.current_class !== 'string') throw new Error('unexpected xray payload');
  return {
    value: row.current_class,
    at: parseUtc(row.time_tag),
    peak: typeof row.max_class === 'string' ? row.max_class : null,
  };
}

const READERS = { flux: readFlux, kp: readKp, xray: readXray };

/**
 * Read all three, independently.
 *
 * `previous` is the last successful result, so a source that fails this time
 * keeps its old reading and grows stale rather than vanishing. Each entry comes
 * back as `{ ok, ...fields }` or `{ ok: false, error, ...lastGood }`.
 */
export async function readAll(previous = {}) {
  const entries = await Promise.all(
    Object.entries(READERS).map(async ([key, read]) => {
      try {
        return [key, { ok: true, ...(await read()) }];
      } catch (err) {
        const last = previous[key];
        return [key, { ...(last && last.ok ? last : {}), ok: false, error: String(err.message || err) }];
      }
    })
  );
  return Object.fromEntries(entries);
}

/**
 * Severity band for a Kp value, for colouring.
 *
 * NOAA's own G-scale starts at Kp 5 (G1 minor storm); below that is quiet to
 * unsettled. Kept as three plain buckets because at three metres a reader gets
 * one bit of information from colour, not five.
 */
export function kpBand(kp) {
  if (typeof kp !== 'number') return 'unknown';
  if (kp < 4) return 'quiet';
  if (kp < 5) return 'unsettled';
  return 'storm';
}

/** Severity band for an X-ray class string like "C2.1". */
export function xrayBand(cls) {
  if (typeof cls !== 'string' || !cls) return 'unknown';
  const letter = cls[0].toUpperCase();
  if (letter === 'A' || letter === 'B') return 'quiet';
  if (letter === 'C') return 'unsettled';
  return 'storm'; // M and X
}

export { SOURCES };
