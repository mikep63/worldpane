// The polar sky plot: one pass, drawn the way an antenna is pointed.
//
// North at the top, the horizon as the rim, the zenith at the centre, and
// elevation as concentric rings. It is the standard pass diagram because it is
// the one that maps onto the physical act: read a bearing off the rim, read how
// high off the rings, and the shape of the arc tells you in a glance whether
// this is a low northern skim or something worth setting up for.
//
// The projection is a pure function and checked in spec/check_skyplot.mjs. An
// azimuth that runs the wrong way round the compass draws a perfectly plausible
// arc pointing at the wrong quarter of the sky, which is the sort of error that
// only a numeric check catches.

const D2R = Math.PI / 180;

/**
 * Azimuth and elevation to a point in the unit disc, centre (0, 0).
 *
 * Radius is `(90 - el) / 90`: the zenith is the centre and the horizon is the
 * rim, so the plot is the sky as seen looking up. Azimuth runs **clockwise from
 * north**, which is the compass convention and the opposite of the
 * anticlockwise-from-east that maths uses -- hence `sin` on x and `-cos` on y
 * rather than the other way about.
 *
 * y is negative upward, matching the canvas. An elevation below the horizon
 * lands outside the unit circle on purpose; clipping is the caller's business,
 * because a track that dips below zero should be clipped, not folded back.
 */
export function polar(azDeg, elDeg) {
  const f = (90 - elDeg) / 90;
  const a = azDeg * D2R;
  return { x: f * Math.sin(a), y: -f * Math.cos(a) };
}

/** Elevation rings that get drawn, in degrees. The horizon is the rim. */
export const RINGS = [30, 60];

/** The four bearings anyone reads without thinking. */
export const CARDINALS = [
  { label: 'N', az: 0 },
  { label: 'E', az: 90 },
  { label: 'S', az: 180 },
  { label: 'W', az: 270 },
];

/** Scale a unit-disc point onto a canvas. */
function at(p, cx, cy, r) {
  return { x: cx + p.x * r, y: cy + p.y * r };
}

/**
 * Draw the empty sky: rim, elevation rings, cardinal spokes and labels.
 *
 * Split from the track because the frame is the same for every pass and the
 * track is not, and because a plot with no pass selected should still look like
 * a sky rather than an empty box.
 */
export function drawFrame(ctx, cx, cy, r, { ring, label, fontPx = 13 }) {
  ctx.save();
  ctx.strokeStyle = ring;
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Inner rings dashed, so the horizon stays the one solid boundary -- it is
  // the only ring with a physical meaning, and the others are just a scale.
  ctx.setLineDash([3, 4]);
  for (const el of RINGS) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * ((90 - el) / 90), 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const { az } of CARDINALS) {
    const edge = at(polar(az, 0), cx, cy, r);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(edge.x, edge.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.fillStyle = label;
  ctx.font = `600 ${fontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const { label: text, az } of CARDINALS) {
    // Just outside the rim. Inside, the letters sit on the track.
    const p = at(polar(az, 0), cx, cy, r + fontPx * 0.95);
    ctx.fillText(text, p.x, p.y);
  }
  ctx.restore();
}

/**
 * Draw the arc, with the three moments marked.
 *
 * Points below the horizon are dropped rather than clamped: the track is what
 * is visible from here, and folding a below-horizon sample back onto the rim
 * would invent a bearing the operator could act on.
 */
export function drawTrack(ctx, cx, cy, r, track, { stroke, lineWidth = 2 }) {
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  let down = true;
  for (const point of track) {
    if (point.el < 0) { down = true; continue; }
    const p = at(polar(point.az, point.el), cx, cy, r);
    if (down) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
    down = false;
  }
  ctx.stroke();
  ctx.restore();
}

/** A dot on the plot: rise, set, or the peak. */
export function drawPoint(ctx, cx, cy, r, az, el, { fill, halo, radius = 4 }) {
  const p = at(polar(az, el), cx, cy, r);
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = halo;
  ctx.stroke();
  ctx.restore();
}
