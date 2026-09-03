// Equirectangular world map: coastline, overlays, night, and the markers.
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
 * Decode a `{ scale, lines }` payload into flat [x0,y0,x1,y1,...] pixel runs.
 *
 * The files store integers scaled by 10 or 100 rather than decimals, so this
 * divides once per coordinate. Projecting at load time rather than per frame
 * means the draw loop touches no arithmetic at all -- it matters because this
 * redraws every minute for months.
 *
 * The generated graticule uses `scale: 1`, which costs it a redundant division
 * and buys one decoder for every layer.
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

/**
 * Fetch one layer file.
 *
 * Callers decide what a failure means: the coastline is the map and its absence
 * is reported, while an overlay that will not load is simply not drawn. That
 * asymmetry is the reason overlays live in their own files rather than being
 * folded into coastline.json.
 */
export async function loadLayer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

/** Stroke pre-projected pixel runs. `dash` is in device pixels, or null. */
export function strokeLines(ctx, lines, { stroke, lineWidth = 1, dash = null }) {
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  for (const pts of lines) {
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Paint the static layers onto their own canvas once.
 *
 * None of them ever change; only the night overlay moves. Drawing them to an
 * offscreen canvas and blitting that each frame keeps some 80,000 line segments
 * out of the per-minute redraw -- which is why vertex count was never a
 * performance question here, only a download one.
 *
 * `layers` is drawn in order, so the caller controls what sits on top. The
 * coastline goes last: it is the line the eye should find first.
 */
export function renderBasemap(w, h, layers, { background }) {
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
  for (const layer of layers) {
    if (layer && layer.lines && layer.lines.length) strokeLines(ctx, layer.lines, layer);
  }
  return c;
}

/**
 * Maidenhead field letters along the top and left edges.
 *
 * Painted into the basemap with the grid, so they cost nothing per frame. They
 * are inset from the edge rather than centred on it, because half a letter
 * hanging off the canvas reads as a rendering fault.
 */
export function drawFieldLabels(ctx, labels, w, h, { fill, fontPx, pad }) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.font = `${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  for (const label of labels) {
    const { x, y } = project(label.lon, label.lat, w, h);
    if (label.edge === 'top') {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label.text, x, pad);
    } else {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label.text, pad, y);
    }
  }
  ctx.restore();
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

/**
 * Put a symbol at a lat/lon.
 *
 * The symbol itself comes from js/symbols.js and is handed in, so this module
 * stays about the projection and knows nothing about what a sun looks like.
 * The globe has the same function against its own geometry.
 */
export function drawMarker(ctx, lat, lon, w, h, symbol) {
  const { x, y } = project(lon, lat, w, h);
  symbol(x, y);
}
