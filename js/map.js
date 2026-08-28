// Equirectangular world map: coastline, night overlay, station marker.
//
// The projection is deliberately the trivial one -- longitude and latitude map
// linearly to x and y. See DESIGN.md, "Flat equirectangular, not a globe".
//
// Everything that can be a pure function is one, so it can be checked under the
// JavaScriptCore shell. The canvas calls are the thin remainder.

/** Longitude/latitude to pixel, on a canvas `w` x `h` covering the whole globe. */
export function project(lon, lat, w, h) {
  return { x: ((lon + 180) / 360) * w, y: ((90 - lat) / 180) * h };
}

/** Pixel back to longitude/latitude. */
export function unproject(x, y, w, h) {
  return { lon: (x / w) * 360 - 180, lat: 90 - (y / h) * 180 };
}

/**
 * Decode data/coastline.json into flat [x0,y0,x1,y1,...] pixel runs.
 *
 * The file stores integers scaled by 100 rather than decimals, so this divides
 * once per coordinate. Projecting at load time rather than per frame means the
 * draw loop touches no arithmetic at all -- it matters because this redraws
 * every minute for months.
 */
export function projectCoastline(data, w, h) {
  const s = data.scale;
  const out = [];
  for (const line of data.lines) {
    const pts = new Float32Array(line.length);
    for (let i = 0; i < line.length; i += 2) {
      const p = project(line[i] / s, line[i + 1] / s, w, h);
      pts[i] = p.x;
      pts[i + 1] = p.y;
    }
    out.push(pts);
  }
  return out;
}

export async function loadCoastline(url = 'data/coastline.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`coastline ${res.status}`);
  return res.json();
}

/**
 * Paint the coastline onto its own canvas once.
 *
 * The coastline never changes; only the night overlay moves. Drawing it to an
 * offscreen canvas and blitting that each frame keeps 60,000 line segments out
 * of the per-minute redraw -- which is why the vertex count of the 50m file
 * was never a performance question.
 */
export function renderCoastline(w, h, lines, { stroke, background }) {
  // A detached <canvas> rather than OffscreenCanvas, which Safari only gained
  // in 16.4. This is meant to be handed to other operators, and some of them
  // are running it on whatever iPad was spare -- the two perform identically
  // for a blit source.
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const pts of lines) {
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  }
  ctx.stroke();
  return c;
}

/** Fill the night side, given the polygon from terminator.nightPolygon. */
export function drawNight(ctx, polygon, w, h, fill) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.beginPath();
  polygon.forEach(([lon, lat], i) => {
    const { x, y } = project(lon, lat, w, h);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** The operator's grid square: a ring, sized to read at three metres. */
export function drawStation(ctx, lat, lon, w, h, { stroke, fill, radius = 5 }) {
  const { x, y } = project(lon, lat, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.restore();
}
