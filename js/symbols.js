// The three marks that go on the map: the operator, the Sun and the Moon.
//
// They live apart from both projections because neither projection should care
// what a sun looks like, and because the flat map and the globe must draw the
// same symbol -- two copies would drift. Each takes canvas coordinates and a
// radius; working out where on the canvas is the projection's job.
//
// They exist in this shape for a reason. Two plain discs told you there were
// two bodies but not which was which, so the display needed a legend, and a
// legend on a wall display is an admission that the picture failed. A rayed
// disc and a phased crescent identify themselves. See DESIGN.md, "The Sun and
// the Moon are marked, plainly".
//
// Everything here draws twice: once wide in the background colour, once in its
// own. That halo is what lets a thin crescent survive crossing a coastline.

const D2R = Math.PI / 180;
const RAYS = 8;
// Where the rays start and end, as multiples of the disc radius.
const RAY_INNER = 1.45;
const RAY_OUTER = 2.15;

/**
 * The shape of a lit Moon, from its phase angle in degrees.
 *
 * `phase` is the ecliptic elongation astronomy-engine reports: 0 new, 90 first
 * quarter, 180 full, 270 last quarter. Pure, so spec/check_symbols.mjs can hold
 * it to the four phases everyone can check by looking up.
 *
 * `ex` is the signed semi-axis of the terminator ellipse as a fraction of the
 * radius. It runs +1 at new through 0 at the quarters to -1 at full, which is
 * exactly `cos(phase)` -- the terminator is a circle seen edge-on at the
 * quarters and face-on at new and full.
 *
 * `waning` mirrors the drawing. Unmirrored the lit limb is on the right, which
 * is a waxing Moon seen from the northern hemisphere; past full the light is on
 * the other side.
 */
export function phaseGeometry(phase) {
  const p = ((phase % 360) + 360) % 360;
  return {
    ex: Math.cos(p * D2R),
    lit: (1 - Math.cos(p * D2R)) / 2,
    waning: p > 180,
  };
}

/** Stroke and fill a path twice: a wide halo underneath, the colour on top. */
function haloed(ctx, halo, colour, width, path) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = halo;
  ctx.lineWidth = width + 2.5;
  path(ctx);
  ctx.stroke();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  path(ctx);
  ctx.stroke();
  ctx.restore();
}

/** The operator's grid: a plain disc, the one mark that is not a sky object. */
export function station(ctx, x, y, r, { fill, halo }) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = halo;
  ctx.stroke();
  ctx.restore();
}

/**
 * The subsolar point: a disc with eight rays.
 *
 * The rays are the whole point. A filled circle is a dot; a circle with rays is
 * a sun at any size a person can still see it, and it is the difference between
 * needing a legend and not.
 */
export function sun(ctx, x, y, r, { fill, halo }) {
  const width = Math.max(1.5, r * 0.34);
  haloed(ctx, halo, fill, width, (c) => {
    c.beginPath();
    for (let i = 0; i < RAYS; i++) {
      const a = (i * 2 * Math.PI) / RAYS;
      c.moveTo(x + Math.cos(a) * r * RAY_INNER, y + Math.sin(a) * r * RAY_INNER);
      c.lineTo(x + Math.cos(a) * r * RAY_OUTER, y + Math.sin(a) * r * RAY_OUTER);
    }
  });
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = halo;
  ctx.stroke();
  ctx.restore();
}

/**
 * The sublunar point: an outlined disc with the lit fraction filled.
 *
 * The outline is always drawn and the fill is not, so the symbol survives both
 * ends of the month -- a full Moon is a filled ring and a new Moon an empty
 * one, and neither is mistakable for the Sun once the Sun has rays.
 *
 * The lit region is the near limb as a half circle, closed by the terminator
 * ellipse. The ellipse's sweep direction flips with the sign of `ex`, which is
 * what turns a crescent into a gibbous at the quarters.
 */
export function moon(ctx, x, y, r, { fill, halo }, phase) {
  const { ex, waning } = phaseGeometry(phase);

  ctx.save();
  if (waning) {
    // Mirror about the marker's own vertical axis rather than negating the
    // geometry: one transform is easier to be sure of than four sign flips.
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.translate(-x, -y);
  }
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, false);
  ctx.ellipse(x, y, Math.abs(ex) * r, r, 0, Math.PI / 2, -Math.PI / 2, ex > 0);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();

  // The rim last, so it sits over the fill and closes the shape.
  haloed(ctx, halo, fill, Math.max(1.25, r * 0.2), (c) => {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
  });
}
