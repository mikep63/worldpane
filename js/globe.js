// Orthographic globe: a rotatable hemisphere drawn from the same coastline.
//
// This does not replace the flat map. See DESIGN.md, "Flat equirectangular,
// not a globe" -- a hemisphere hides the far-side terminator until someone
// walks over and turns it, so the flat map stays the default and this is the
// second view.
//
// Two decisions shape the code:
//
//   * Vertices are held as unit 3-vectors, built once at load. Rotating is
//     then a 3x3 multiply per vertex, and the same buffers serve every canvas
//     size -- unlike the flat map, nothing needs re-projecting on resize.
//   * The night side is built as a screen-space polygon and returned, rather
//     than issued straight to the canvas. That is the part which can be
//     silently wrong, so it is the part that has to be checkable under jsc.

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

// ---------- vectors ---------------------------------------------------------

/** Longitude/latitude to a unit vector. x through 0degE, z through the pole. */
export function toVec(lonDeg, latDeg) {
  const lon = lonDeg * D2R;
  const lat = latDeg * D2R;
  const cl = Math.cos(lat);
  return [cl * Math.cos(lon), cl * Math.sin(lon), Math.sin(lat)];
}

/** And back, so a pointer position can name a place. */
export function toLonLat(v) {
  const z = Math.max(-1, Math.min(1, v[2]));
  return { lon: Math.atan2(v[1], v[0]) * R2D, lat: Math.asin(z) * R2D };
}

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalise(a) {
  const m = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / m, a[1] / m, a[2] / m];
}

/** Some unit vector at right angles to `s`. Which one does not matter. */
function perpendicular(s) {
  const axis = Math.abs(s[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  return normalise(cross(s, axis));
}

// ---------- projection ------------------------------------------------------

/**
 * The viewing frame for a globe centred on (lon0, lat0).
 *
 * `e` points east across the screen, `n` points north up it, and `v` points at
 * the viewer. All three are unit and mutually perpendicular, which is what
 * makes projection three dot products and nothing else.
 */
export function basis(lon0Deg, lat0Deg) {
  const l = lon0Deg * D2R;
  const p = lat0Deg * D2R;
  const sl = Math.sin(l);
  const cl = Math.cos(l);
  const sp = Math.sin(p);
  const cp = Math.cos(p);
  return {
    e: [-sl, cl, 0],
    n: [-sp * cl, -sp * sl, cp],
    v: [cp * cl, cp * sl, sp],
  };
}

/**
 * A unit vector to screen coordinates on a unit-radius disc.
 *
 * `sx` runs right, `sy` runs *up* -- the flip into canvas coordinates happens
 * at the one place that touches the canvas, so everything above it can be
 * reasoned about as ordinary maths. `depth` is positive on the near side; the
 * far half of the world projects onto the same disc and has to be dropped.
 */
export function project(v, b) {
  return {
    sx: dot(v, b.e),
    sy: dot(v, b.n),
    depth: dot(v, b.v),
  };
}

export function isVisible(v, b) {
  return dot(v, b.v) >= 0;
}

/** Where a segment crosses the limb, as a unit vector. */
function crossing(p, dp, q, dq) {
  const t = dp / (dp - dq);
  return normalise([
    p[0] + t * (q[0] - p[0]),
    p[1] + t * (q[1] - p[1]),
    p[2] + t * (q[2] - p[2]),
  ]);
}

// ---------- rotation --------------------------------------------------------

/** Longitude into [-180, 180), so the view centre never drifts off the number line. */
export function wrapLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Signed shortest way from `a` to `b` in degrees, for animating home. */
export function shortestLon(a, b) {
  return wrapLon(b - a);
}

/**
 * A drag, in CSS pixels, applied to the view centre.
 *
 * Dragging a full radius turns the globe 90 degrees, which makes the surface
 * roughly follow the finger near the centre and slip behind it near the limb.
 * Matching the finger exactly everywhere means unprojecting the touch point,
 * which breaks down the moment the finger leaves the disc -- and on a wall
 * display it leaves the disc constantly.
 */
export function rotateBy(view, dxCss, dyCss, radiusCss) {
  const dpp = 90 / Math.max(radiusCss, 1);
  return {
    lon0: wrapLon(view.lon0 - dxCss * dpp),
    lat0: Math.max(-90, Math.min(90, view.lat0 + dyCss * dpp)),
  };
}

/** Ease in and out, so the return home starts and stops without a jolt. */
export function ease(t) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Interpolate a view centre towards `to`, taking the short way round. */
export function interpolate(from, to, t) {
  const k = ease(t);
  return {
    lon0: wrapLon(from.lon0 + shortestLon(from.lon0, to.lon0) * k),
    lat0: from.lat0 + (to.lat0 - from.lat0) * k,
  };
}

// ---------- the night side --------------------------------------------------

function limbPoint(alpha, b) {
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  return [
    ca * b.e[0] + sa * b.n[0],
    ca * b.e[1] + sa * b.n[1],
    ca * b.e[2] + sa * b.n[2],
  ];
}

function norm2pi(a) {
  return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

/**
 * The visible night, as a closed polygon on the unit disc.
 *
 * This is the piece the flat map gets for free and the globe does not.
 * `terminator.nightPolygon` closes its region along the dark pole, which is
 * meaningless here: the far side projects onto the same disc, so that polygon
 * folds over itself. The region has to be rebuilt out of two boundaries.
 *
 * The terminator is the great circle at right angles to the sun. Writing its
 * points as `a cos t + c sin t` for any frame perpendicular to the sun, the
 * depth along the view axis is `amp * cos(t - t0)` -- one sinusoid. So the
 * visible half of the terminator is exactly the half-turn centred on t0, with
 * no scanning for where it goes behind, and its two ends sit on the limb by
 * construction because that is where the depth is zero.
 *
 * The region then closes along the limb, taking whichever way round stays in
 * darkness. The limb is a circle in screen space, so that half is trivial.
 *
 * Degenerate when the sun is straight ahead or straight behind: the terminator
 * and the limb are then the same circle, and the visible hemisphere is wholly
 * lit or wholly dark. Both are real -- looking down on the subsolar point is
 * not an edge case, it happens at every local noon.
 */
export function nightRegion(b, sun, steps = 96) {
  const a = perpendicular(sun);
  const c = cross(sun, a);
  const av = dot(a, b.v);
  const cv = dot(c, b.v);
  const amp = Math.hypot(av, cv);

  if (amp < 1e-9) {
    if (dot(sun, b.v) >= 0) return []; // sun overhead: all day
    return circle(steps * 2);          // sun behind: all night
  }

  const t0 = Math.atan2(cv, av);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = t0 - Math.PI / 2 + (Math.PI * i) / steps;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    const p = [
      a[0] * ct + c[0] * st,
      a[1] * ct + c[1] * st,
      a[2] * ct + c[2] * st,
    ];
    pts.push([dot(p, b.e), dot(p, b.n)]);
  }

  const first = pts[0];
  const last = pts[pts.length - 1];
  const from = Math.atan2(last[1], last[0]);
  const to = Math.atan2(first[1], first[0]);
  let sweep = norm2pi(to - from);
  if (dot(limbPoint(from + sweep / 2, b), sun) >= 0) sweep -= 2 * Math.PI;

  const n = Math.max(2, Math.ceil((Math.abs(sweep) * steps) / Math.PI));
  for (let i = 1; i < n; i++) {
    const alpha = from + (sweep * i) / n;
    pts.push([Math.cos(alpha), Math.sin(alpha)]);
  }
  return pts;
}

function circle(steps) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    pts.push([Math.cos(a), Math.sin(a)]);
  }
  return pts;
}

// ---------- coastline -------------------------------------------------------

/**
 * Decode a `{ scale, lines }` payload into unit vectors, one array per line.
 *
 * The flat map bakes pixels in at this point and re-does it on every resize.
 * Here the trigonometry is what gets cached and the pixels are computed per
 * frame, because the pixels change whenever the globe turns. Float32 costs
 * about 0.6 m of precision on a map where a pixel is 26 km.
 */
export function prepareLayer(data) {
  const s = data.scale;
  const out = [];
  for (const line of data.lines) {
    const count = line.length / 2;
    const v = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const lon = (line[2 * i] / s) * D2R;
      const lat = (line[2 * i + 1] / s) * D2R;
      const cl = Math.cos(lat);
      v[3 * i] = cl * Math.cos(lon);
      v[3 * i + 1] = cl * Math.sin(lon);
      v[3 * i + 2] = Math.sin(lat);
    }
    out.push(v);
  }
  return out;
}

export function vertexCount(prepared) {
  let n = 0;
  for (const v of prepared) n += v.length / 3;
  return n;
}

/**
 * A coarser copy, for the frames drawn while a finger is down.
 *
 * 60,392 vertices is nothing to paint once a minute and a lot to paint sixty
 * times a second. Every stride-th vertex is a crude reduction, and it does not
 * matter: nobody inspects a coastline while dragging it, and the full detail
 * is back the moment the finger lifts. Lines of three points or fewer are kept
 * whole so small islands do not blink out of existence mid-drag.
 */
export function decimate(prepared, stride) {
  if (stride <= 1) return prepared;
  const out = [];
  for (const v of prepared) {
    const count = v.length / 3;
    if (count <= 3) {
      out.push(v);
      continue;
    }
    const keep = [];
    for (let i = 0; i < count; i += stride) keep.push(i);
    if (keep[keep.length - 1] !== count - 1) keep.push(count - 1);
    const d = new Float32Array(keep.length * 3);
    for (let j = 0; j < keep.length; j++) {
      const i = keep[j];
      d[3 * j] = v[3 * i];
      d[3 * j + 1] = v[3 * i + 1];
      d[3 * j + 2] = v[3 * i + 2];
    }
    out.push(d);
  }
  return out;
}

// ---------- canvas ----------------------------------------------------------
//
// Everything below touches the canvas and is verified by looking at the map.

export function fillDisc(ctx, cx, cy, r, fill) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function strokeLimb(ctx, cx, cy, r, stroke, lineWidth = 1.5) {
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Stroke the visible part of one prepared layer.
 *
 * A line that runs off the edge of the world is cut at the limb rather than
 * simply stopped at its last visible vertex: without it, coastlines end up to
 * half a degree short of the edge and the globe grows a ragged rim.
 */
export function strokeLayer(ctx, prepared, b, cx, cy, r, { stroke, lineWidth = 1, dash = null }) {
  const { e, n, v } = b;
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  for (const pts of prepared) {
    const count = pts.length / 3;
    let prev = null;
    let prevDepth = 0;
    let open = false;
    for (let i = 0; i < count; i++) {
      const p = [pts[3 * i], pts[3 * i + 1], pts[3 * i + 2]];
      const d = dot(p, v);
      if (d >= 0) {
        const x = cx + r * dot(p, e);
        const y = cy - r * dot(p, n);
        if (!open) {
          if (prev) {
            const c = crossing(prev, prevDepth, p, d);
            ctx.moveTo(cx + r * dot(c, e), cy - r * dot(c, n));
            ctx.lineTo(x, y);
          } else {
            ctx.moveTo(x, y);
          }
          open = true;
        } else {
          ctx.lineTo(x, y);
        }
      } else if (open) {
        const c = crossing(prev, prevDepth, p, d);
        ctx.lineTo(cx + r * dot(c, e), cy - r * dot(c, n));
        open = false;
      }
      prev = p;
      prevDepth = d;
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** Fill the polygon from nightRegion. */
export function fillNight(ctx, region, cx, cy, r, fill) {
  if (!region.length) return;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i < region.length; i++) {
    const x = cx + r * region[i][0];
    const y = cy - r * region[i][1];
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * A filled disc at a lat/lon, when it is on this side of the world.
 *
 * The visibility test is the whole difference from the flat map's version: a
 * point on the far hemisphere must not be drawn at the mirrored place on the
 * near one. Returns whether it was drawn, so a caller can say so.
 */
export function drawMarker(ctx, lat, lon, b, cx, cy, r, { stroke, fill, radius = 5 }) {
  const p = toVec(lon, lat);
  if (dot(p, b.v) < 0) return false;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx + r * dot(p, b.e), cy - r * dot(p, b.n), radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.restore();
  return true;
}
