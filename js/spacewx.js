// Space weather from NOAA SWPC.
//
// Five endpoints, all CORS-open and tiny -- the flux one is 47 bytes and the
// two solar wind files are 59 and 60. See DESIGN.md, "First slice". They are
// fetched directly rather than through the scheduled Action, which is
// insulation this does not need yet.
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
  // Two files for one reading, 59 and 60 bytes. Smaller together than the
  // flux endpoint, and the pair is one panel: Bz is the number and the wind
  // speed is the context for it.
  windSpeed: `${BASE}/products/summary/solar-wind-speed.json`,
  magField: `${BASE}/products/summary/solar-wind-mag-field.json`,
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

/**
 * Solar wind: Bz, with speed alongside it.
 *
 * The one leading indicator on the display. Kp is a three-hour index and says
 * what already happened; southward Bz is what couples solar wind energy into
 * the magnetosphere in the first place, so it moves first and Kp follows an
 * hour or two later. For an operator watching a path about to degrade, that is
 * the difference between a warning and a post-mortem.
 *
 * Both files or neither: a speed with no field, or a field with no speed, is
 * half a panel, and the stale-rather-than-blank rule already covers the case.
 */
async function readWind() {
  const [speed, mag] = await Promise.all([
    getJson(SOURCES.windSpeed),
    getJson(SOURCES.magField),
  ]);
  const s = Array.isArray(speed) ? speed[0] : null;
  const m = Array.isArray(mag) ? mag[0] : null;
  if (!s || typeof s.proton_speed !== 'number') throw new Error('unexpected solar wind payload');
  if (!m || typeof m.bz_gsm !== 'number') throw new Error('unexpected magnetic field payload');
  return {
    value: m.bz_gsm,
    speed: Math.round(s.proton_speed),
    bt: typeof m.bt === 'number' ? m.bt : null,
    at: parseUtc(m.time_tag) || parseUtc(s.time_tag),
  };
}

const READERS = { flux: readFlux, kp: readKp, xray: readXray, wind: readWind };

/**
 * Read every source, independently.
 *
 * `previous` is the last successful result, so a source that fails this time
 * keeps its old reading and grows stale rather than vanishing. Each entry comes
 * back as `{ ok, ...fields }` or `{ ok: false, error, ...lastGood }`.
 */
export async function readAll(previous = {}) {
  const entries = await Promise.all(
    Object.entries(READERS).map(async ([key, read]) => {
      try {
        // `at` is when the observation was made and `fetchedAt` is when we last
        // succeeded in asking. They are wildly different for the flux endpoint,
        // which publishes once a day -- reporting the observation age made the
        // panel say "6 h old" permanently while everything worked perfectly.
        return [key, { ok: true, fetchedAt: new Date(), ...(await read()) }];
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

/**
 * Severity band for Bz in nanotesla.
 *
 * Negative is southward and southward is what matters; a northward field shuts
 * the coupling off however strong it is, which is why this is not a magnitude.
 *
 * The boundaries are a **stated convention**, as the grey line's are. The
 * physics supplies no threshold -- coupling scales smoothly and depends on how
 * long the field holds -- but -3 is where it stops being noise and -8 is where
 * operators start watching for aurora. Say so in the interface rather than
 * implying a measurement.
 */
export function bzBand(bz) {
  if (typeof bz !== 'number') return 'unknown';
  if (bz > -3) return 'quiet';
  if (bz > -8) return 'unsettled';
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
