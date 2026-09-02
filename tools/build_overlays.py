#!/usr/bin/env python3
"""Fetch Natural Earth's boundary and lake layers and reduce them for the map.

    python3 tools/build_overlays.py

Downloads to data/raw/ (gitignored, regenerable) and writes data/borders.json
and data/lakes.json (committed, published). Standard library only.

This is build_coastline.py's sibling and deliberately mirrors it -- same
integer-scaled payload shape, same "check the extent before declaring success"
ending. What differs is recorded in DESIGN.md, "Borders, lakes and a grid":

  * Borders quantise to ONE decimal, not two. 0.1 deg is 11 km against a 26 km
    pixel, and a border is mostly geodesic straight lines that lose nothing to
    it -- unlike a coastline, which is fractal all the way down.
  * Borders ship in two arrays. Natural Earth marks 35 of its 390 segments
    disputed, line-of-control, indefinite or indeterminate; those are drawn
    dashed. Filtering them out instead would put a visible hole across northern
    India and leave Israel with no eastern border.
  * Lakes are shorelines, so they keep the coastline's two decimals.

Natural Earth is public domain. No attribution is required; the About page
credits it anyway.
"""

import json
import os
import sys
import urllib.request

BASE = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    "master/geojson/"
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data")

# The only class Natural Earth considers settled. Everything else it flags for
# verification, and this build keeps that distinction rather than deciding it.
SETTLED = "International boundary (verify)"

# Natural Earth's own prominence ranking. 2.0 keeps the 44 lakes a world map at
# this scale should have -- all five Great Lakes, Baikal, Victoria, Tanganyika,
# Malawi, Chad, Titicaca, the Aral remnants -- and drops the 368 reservoirs and
# ponds that would be sub-pixel smears. The Caspian is absent from this layer
# because Natural Earth classes it as a sea; it is already in the coastline.
LAKE_MIN_ZOOM = 2.0


def fetch(name):
    """Download unless already present -- Natural Earth changes rarely."""
    dest = os.path.join(RAW, name + ".geojson")
    if os.path.exists(dest):
        print(f"  using cached {os.path.relpath(dest, ROOT)}")
        return dest
    os.makedirs(RAW, exist_ok=True)
    print(f"  fetching {name}")
    req = urllib.request.Request(BASE + name + ".geojson",
                                 headers={"User-Agent": "worldpane-build"})
    with urllib.request.urlopen(req, timeout=180) as r, open(dest, "wb") as f:
        f.write(r.read())
    return dest


def rings_of(geometry):
    """Yield each open or closed run of coordinates, whatever the geometry."""
    kind, coords = geometry["type"], geometry["coordinates"]
    if kind == "LineString":
        yield coords
    elif kind == "MultiLineString":
        yield from coords
    elif kind == "Polygon":
        # Rings arrive closed (last point equals first), which is what makes a
        # lake stroke as a lake and not as a broken arc. Holes -- islands in a
        # lake -- are rings too, and drawing them is correct.
        yield from coords
    elif kind == "MultiPolygon":
        for polygon in coords:
            yield from polygon
    else:
        raise ValueError(f"unexpected geometry {kind!r}")


def quantise(line, scale):
    """Round to `scale` and drop points that collapse onto their predecessor.

    At 1dp this stops mattering as a guard and starts mattering as a saving:
    border segments that ran along a river lose about a quarter of their points
    here, which is precisely the redundancy 1dp is meant to remove.
    """
    out = []
    for lon, lat in line:
        p = (round(lon * scale), round(lat * scale))
        if not out or p != out[-1]:
            out.append(p)
    return out


def encode(features, scale):
    """Features to the flat [lon,lat,lon,lat,...] integer runs the client reads."""
    lines = []
    for feature in features:
        if feature.get("geometry") is None:
            continue
        for ring in rings_of(feature["geometry"]):
            q = quantise(ring, scale)
            if len(q) >= 2:
                lines.append([c for p in q for c in p])
    return lines


def extent(lines, scale):
    lons = [line[i] / scale for line in lines for i in range(0, len(line), 2)]
    lats = [line[i] / scale for line in lines for i in range(1, len(line), 2)]
    return min(lons), min(lats), max(lons), max(lats)


def write(path, payload):
    with open(path, "w") as f:
        json.dump(payload, f, separators=(",", ":"))
    return os.path.getsize(path) / 1024


def build_borders():
    src = json.load(open(fetch("ne_50m_admin_0_boundary_lines_land")))
    settled, disputed = [], []
    for f in src["features"]:
        (settled if f["properties"].get("FEATURECLA") == SETTLED else disputed).append(f)

    scale = 10  # one decimal place; see the module docstring
    payload = {
        "scale": scale,
        "lines": encode(settled, scale),
        "disputed": encode(disputed, scale),
    }
    kb = write(os.path.join(OUT, "borders.json"), payload)
    n_settled = sum(len(l) // 2 for l in payload["lines"])
    n_disputed = sum(len(l) // 2 for l in payload["disputed"])
    bbox = extent(payload["lines"] + payload["disputed"], scale)

    print(f"  borders    {len(settled)} settled + {len(disputed)} disputed features")
    print(f"  points     {n_settled:,} settled, {n_disputed:,} disputed")
    print(f"  bbox       {bbox[0]:.1f},{bbox[1]:.1f} .. {bbox[2]:.1f},{bbox[3]:.1f}")
    print(f"  size       {kb:,.0f} KB")

    problems = []
    # A borders file that lost a continent is still valid JSON. These are the
    # cheap facts that would break first.
    if not payload["disputed"]:
        problems.append("no disputed segments; the class split has stopped working")
    if len(settled) < 300:
        problems.append(f"only {len(settled)} settled boundaries; expected well over 300")
    if bbox[0] > -140 or bbox[2] < 140:
        problems.append(f"longitude extent {bbox[0]:.1f}..{bbox[2]:.1f} is missing a continent")
    if bbox[1] > -50 or bbox[3] < 60:
        problems.append(f"latitude extent {bbox[1]:.1f}..{bbox[3]:.1f} is too shallow")
    return problems


def build_lakes():
    src = json.load(open(fetch("ne_50m_lakes")))
    keep = [f for f in src["features"]
            if (f["properties"].get("min_zoom") or 99) <= LAKE_MIN_ZOOM]

    scale = 100  # a lake is a shoreline; match the coastline
    payload = {"scale": scale, "lines": encode(keep, scale)}
    kb = write(os.path.join(OUT, "lakes.json"), payload)
    points = sum(len(l) // 2 for l in payload["lines"])
    bbox = extent(payload["lines"], scale)
    names = {f["properties"].get("name") for f in keep}

    print(f"  lakes      {len(keep)} of {len(src['features'])} features kept "
          f"(min_zoom <= {LAKE_MIN_ZOOM})")
    print(f"  points     {points:,} in {len(payload['lines'])} rings")
    print(f"  bbox       {bbox[0]:.1f},{bbox[1]:.1f} .. {bbox[2]:.1f},{bbox[3]:.1f}")
    print(f"  size       {kb:,.0f} KB")

    problems = []
    # Name checks rather than counts: the whole reason this layer exists is the
    # blank middle of North America, so say so by name.
    required = {"Lake Superior", "Lake Michigan", "Lake Huron", "Lake Erie",
                "Lake Ontario", "Lake Baikal", "Lake Victoria"}
    missing = required - names
    if missing:
        problems.append(f"missing lakes that justify the layer: {sorted(missing)}")
    if len(keep) < 30:
        problems.append(f"only {len(keep)} lakes; the min_zoom filter has drifted")
    return problems


def main():
    print("borders")
    problems = build_borders()
    print("\nlakes")
    problems += build_lakes()

    if problems:
        print()
        for p in problems:
            print(f"  ERROR: {p}", file=sys.stderr)
        return 1

    print("\nWrote data/borders.json and data/lakes.json. Fit to publish.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
