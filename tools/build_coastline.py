#!/usr/bin/env python3
"""Fetch Natural Earth's 50m coastline and reduce it to what the map needs.

    python3 tools/build_coastline.py

Downloads to data/raw/ (gitignored, regenerable) and writes data/coastline.json
(committed, published). Standard library only.

Why this exists, from DESIGN.md: the raw file is 1.6 MB of GeoJSON carrying six
or more decimal places -- 0.1 metre precision, on a map where one pixel is about
26 km. Two decimals is 1.1 km, still 24 times finer than a pixel. The raw file
never ships.

Natural Earth is public domain. No attribution is required; the About page
credits it anyway.
"""

import json
import os
import sys
import urllib.request

URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    "master/geojson/ne_50m_coastline.geojson"
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw", "ne_50m_coastline.geojson")
OUT = os.path.join(ROOT, "data", "coastline.json")

# Coordinates are stored as integers at this scale rather than as decimals:
# "-7712" is five characters where "-77.12" is six, and the client divides once
# on load. Worth about 12% of the file for one line of decode.
SCALE = 100


def fetch(url, dest):
    """Download unless already present -- Natural Earth changes rarely."""
    if os.path.exists(dest):
        print(f"  using cached {os.path.relpath(dest, ROOT)}")
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"  fetching {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "worldpane-build"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        f.write(r.read())


def lines_of(geometry):
    """Yield each LineString in a geometry, whatever its type."""
    kind, coords = geometry["type"], geometry["coordinates"]
    if kind == "LineString":
        yield coords
    elif kind == "MultiLineString":
        yield from coords
    else:
        raise ValueError(f"unexpected geometry {kind!r} in a coastline file")


def quantise(line):
    """Round to SCALE and drop points that collapse onto their predecessor.

    Consecutive duplicates cost bytes and draw nothing. In practice 50m
    coastline yields very few -- 24 points out of 60,416 -- so this is a
    guard rather than a saving. It would start to matter at 10m, or at 1dp.
    """
    out = []
    for lon, lat in line:
        p = (round(lon * SCALE), round(lat * SCALE))
        if not out or p != out[-1]:
            out.append(p)
    return out


def main():
    fetch(URL, RAW)
    with open(RAW) as f:
        src = json.load(f)

    lines, points_in, points_out = [], 0, 0
    for feature in src["features"]:
        for line in lines_of(feature["geometry"]):
            points_in += len(line)
            q = quantise(line)
            # A line needs two distinct points to be worth drawing.
            if len(q) >= 2:
                points_out += len(q)
                lines.append([c for p in q for c in p])  # flatten to lon,lat,lon,lat

    payload = {"scale": SCALE, "lines": lines}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(payload, f, separators=(",", ":"))

    # Sanity, not decoration: a coastline file that has lost the poles or a
    # hemisphere is still valid JSON and would draw a plausible-looking wrong
    # world. Check the extent covers the globe before declaring success.
    lons = [lines[i][j] / SCALE for i in range(len(lines)) for j in range(0, len(lines[i]), 2)]
    lats = [lines[i][j] / SCALE for i in range(len(lines)) for j in range(1, len(lines[i]), 2)]
    bbox = (min(lons), min(lats), max(lons), max(lats))

    raw_kb = os.path.getsize(RAW) / 1024
    out_kb = os.path.getsize(OUT) / 1024
    print(f"  lines      {len(lines):,}")
    print(f"  points     {points_in:,} -> {points_out:,} "
          f"({100 * (points_in - points_out) / points_in:.1f}% dropped as duplicates)")
    print(f"  bbox       {bbox[0]:.1f},{bbox[1]:.1f} .. {bbox[2]:.1f},{bbox[3]:.1f}")
    print(f"  size       {raw_kb:,.0f} KB -> {out_kb:,.0f} KB")

    problems = []
    if bbox[0] > -179 or bbox[2] < 179:
        problems.append(f"longitude extent {bbox[0]:.1f}..{bbox[2]:.1f} does not span the globe")
    if bbox[1] > -60 or bbox[3] < 70:
        problems.append(f"latitude extent {bbox[1]:.1f}..{bbox[3]:.1f} is missing polar coastline")
    if len(lines) < 1000:
        problems.append(f"only {len(lines)} lines; 50m coastline should give well over 1000")
    if problems:
        for p in problems:
            print(f"  ERROR: {p}", file=sys.stderr)
        return 1

    print(f"\nWrote {os.path.relpath(OUT, ROOT)}. Fit to publish.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
