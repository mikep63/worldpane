#!/usr/bin/env python3
"""Fetch SatNOGS DB transmitters for the roster and write data/transmitters.json.

    python3 tools/build_transmitters.py

Standard library only. Writes data/transmitters.json (committed, published).

Why a build step rather than a fetch at runtime, which is how every other live
source here works: **SatNOGS DB sends no CORS header.** Not on a GET, not on a
preflight -- checked 2026-09-03 with an Origin header, the way a browser asks.
CelesTrak does; SatNOGS does not. So the browser cannot read it directly and the
data has to arrive some other way. Frequencies change on the order of years, so
bundling a small file is the cheap answer and no scheduled job is needed.

The roster is read out of js/satellites.js rather than repeated here, so the two
cannot drift. Adding a satellite there and re-running this is the whole workflow.

Filtering is the interesting part. SatNOGS marks a great deal "active" -- the
ISS alone lists fifty transmitters and reports forty-one of them active, being
every experiment payload flown since 1998. An operator wants what they can work,
so entries carrying an uplink sort first and the list is capped. Five is enough
for the ISS's repeater, APRS and SSTV, and more than enough for anything else.

LICENCE. SatNOGS DB data is CC BY-SA 4.0, which is share-alike and unlike every
other bundled thing here -- Natural Earth is public domain and carries no
obligation at all. data/transmitters.json is therefore licensed BY-SA rather
than MIT, separately from the code that reads it. See LICENSE section 2.
"""

import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ROSTER_JS = os.path.join(ROOT, "js", "satellites.js")
OUT = os.path.join(ROOT, "data", "transmitters.json")

API = "https://db.satnogs.org/api/transmitters/?format=json&satellite__norad_cat_id={}"

# Per satellite. Beyond this the page stops being a reference and starts being a
# database dump; the sort below makes sure the ones worth keeping survive.
MAX_PER_SAT = 5

# Transponders and transceivers are two-way and therefore workable; a plain
# transmitter is a beacon. Used only for ordering, never to exclude.
TYPE_RANK = {"Transponder": 0, "Transceiver": 1, "Transmitter": 2}


def roster():
    """Catalog numbers and labels, read from js/satellites.js so they can't drift."""
    source = open(ROSTER_JS, encoding="utf-8").read()
    block = re.search(r"export const ROSTER = \[(.*?)\];", source, re.S)
    if not block:
        sys.exit("could not find ROSTER in js/satellites.js")
    found = re.findall(r"catalog:\s*(\d+),\s*label:\s*'([^']+)'", block.group(1))
    if not found:
        sys.exit("ROSTER found but no entries parsed")
    return [(int(cat), label) for cat, label in found]


def fetch(catalog):
    with urllib.request.urlopen(API.format(catalog), timeout=30) as response:
        return json.load(response)


def useful(entries):
    """Alive, active, and actually on a frequency; best first, then capped."""
    live = [
        t for t in entries
        if t.get("alive") and t.get("status") == "active"
        and (t.get("uplink_low") or t.get("downlink_low"))
    ]
    live.sort(key=lambda t: (
        0 if t.get("uplink_low") else 1,              # workable before beacon
        TYPE_RANK.get(t.get("type"), 3),
        t.get("downlink_low") or 0,
    ))
    return live[:MAX_PER_SAT]


def slim(t):
    """Only the fields an operator reads. Frequencies stay integer hertz."""
    return {
        "description": (t.get("description") or "").strip(),
        "mode": t.get("mode"),
        "uplink": t.get("uplink_low"),
        "downlink": t.get("downlink_low"),
        # Which way a linear transponder runs. Getting this wrong sends you up
        # the band while the other station goes down it.
        "invert": bool(t.get("invert")),
        "baud": t.get("baud"),
    }


def main():
    out = {}
    total = 0
    for catalog, label in roster():
        try:
            entries = fetch(catalog)
        except Exception as err:                        # noqa: BLE001
            sys.exit(f"{label} ({catalog}): {err}")
        picked = [slim(t) for t in useful(entries)]
        if not picked:
            print(f"  {label:>7} ({catalog}): nothing active with a frequency")
            continue
        out[str(catalog)] = picked
        total += len(picked)
        for t in picked:
            up = f"{t['uplink'] / 1e6:.4f}" if t["uplink"] else "".ljust(9)
            dn = f"{t['downlink'] / 1e6:.4f}" if t["downlink"] else "".ljust(9)
            print(f"  {label:>7} {t['mode'] or '--':>6}  up {up:>9}  dn {dn:>9}  {t['description'][:38]}")

    if not out:
        sys.exit("no transmitters found for any roster satellite -- refusing to write")

    payload = {
        "source": "SatNOGS DB, https://db.satnogs.org/",
        "license": "CC BY-SA 4.0",
        "satellites": out,
    }
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"), sort_keys=True)
        handle.write("\n")
    size = os.path.getsize(OUT)
    print(f"\nwrote {OUT} -- {len(out)} satellites, {total} transmitters, {size} bytes")
    print("remember: spec/check_sw.mjs will want a new BUILD")


if __name__ == "__main__":
    main()
