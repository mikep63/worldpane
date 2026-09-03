<!--
SPDX-FileCopyrightText: 2026 Mike Parker <mike@rsbl.org>
SPDX-License-Identifier: MIT
-->

# Worldpane

An always-on amateur radio display for a wall-mounted iPad: the day and night
terminator, sun times with the grey-line countdown, space weather, and the next
satellite pass. No installation, no account, no server.

**Live: <https://mikep63.github.io/worldpane/>**

It is a static page. Open the link, enter a grid square, and that is the whole
setup — nothing is sent anywhere, and everything it knows about you stays in
that browser.

## What it shows

- **A world map** with the terminator, drawn from Natural Earth coastlines with
  optional country borders, major lakes and a Maidenhead field grid. Flat
  equirectangular by default; a rotatable orthographic globe is a setting.
- **Sun and Moon markers** at the points where each is overhead, the Moon drawn
  with its actual phase, plus your own grid.
- **Clocks** — UTC to the second, and local.
- **Sunrise, sunset and the grey-line countdown** for your grid.
- **The next satellite pass** above 10°, with peak elevation. Tap it for the
  next 24 hours of passes and a polar sky plot of any one of them, with rise,
  peak and set bearings in degrees and compass points, and the satellite's
  published frequencies and modes.
- **Space weather** — 10.7 cm solar flux, planetary K with its 24-hour trend
  and the A index beside it, the current GOES X-ray class, and solar wind Bz
  with wind speed. All from NOAA SWPC.
- **Band conditions**, derived from those numbers and the sun's angle at your
  grid. An inference, labelled as one — not a propagation model.

It works offline. A service worker precaches the whole app, so a reload with no
network still draws the world; space weather and satellite elements go stale and
say so rather than going blank.

## Putting it on a shack iPad

1. Open the link in Safari and enter your grid square.
2. Share → **Add to Home Screen**. It launches without browser chrome.
3. Settings → Display & Brightness → Auto-Lock → **Never**.
4. Settings → Accessibility → Guided Access, then triple-click to lock it to the
   one app so a passing cat cannot navigate away.

Load it twice the first time: the first load installs the offline copy, the
second serves it.

## Running it locally

No build step and no dependencies. Any static file server will do:

```sh
python3 -m http.server 8080     # then open http://127.0.0.1:8080
```

It must be served over HTTP rather than opened as a `file://` URL — ES modules
and the service worker both require an origin.

## Checks

Thirteen spec files, run under the JavaScriptCore shell that ships with macOS.
There is no `node` here and none is needed. Run them from the repository root;
`check_sw.mjs` reads files relative to the working directory.

```sh
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
for s in grid sun terminator map render globe graticule symbols spacewx bands satellites skyplot sw; do
  $JSC -m spec/check_$s.mjs || break
done
```

They check against physics and geometry rather than against previous output —
solstice declinations, the terminator touching the polar circles, an elevation
of exactly 90° at a satellite's subpoint, the Moon's subpoint landing opposite
the Sun's at full moon. The strongest is the closed-form terminator agreeing
with astronomy-engine's solar altitude to within 0.02° across four dates.

### One thing to know before you commit

`check_sw.mjs` carries the service worker's cache name, which is a digest of
every precached file. **Change any of them and it fails**, printing the line to
paste into `sw.js`:

```
FAIL sw.js precaches changed assets under an unchanged cache name.
     Paste this into sw.js:  const BUILD = 'a1b2c3d4';
```

That is deliberate. A version you have to remember to bump has no symptom when
you forget — the display keeps working, on the old code, forever. The same check
also catches a new module that is not in the precache list, which is the other
way to ship something that works everywhere except offline.

## Layout

```
index.html          the whole app: dashboard, settings, about, passes
sw.js               offline precache; BUILD is set by spec/check_sw.mjs
css/style.css       one stylesheet, light and dark as equals
js/                 ES modules, no bundler
  grid.js           Maidenhead conversion
  sun.js            subsolar and sublunar points, horizon events, grey line
  terminator.js     the night polygon
  map.js            equirectangular projection and canvas drawing
  globe.js          orthographic projection, rotation, far-side clipping
  graticule.js      the generated Maidenhead field grid
  symbols.js        the sun, moon and station marks
  satellites.js     TLE parsing, the roster, pass prediction
  skyplot.js        the polar sky plot projection
  spacewx.js        NOAA SWPC
  bands.js          band conditions, derived from flux, K and sun angle
  settings.js       what is kept on the device
  theme.js          light/dark, auto follows your sunrise
  render.js         state to DOM, with the pure formatters at the top
  main.js           routing, timers and the draw loop
spec/               one check file per module
tools/              build steps (Python, run rarely): Natural Earth, SatNOGS
vendor/             astronomy-engine and satellite-js
data/               quantised coastline, borders, lakes; satellite frequencies
```

`DESIGN.md` is the important file. It records settled decisions **and the
alternatives that lost**, so they are not re-argued — why the map is flat by
default, why there is no DX cluster, why the satellite feature is one line of
text. Read it before changing anything that looks arbitrary; it probably is not.

## Built from

- [astronomy-engine](https://github.com/cosinekitty/astronomy) by Don Cross —
  MIT, vendored
- [satellite-js](https://github.com/shashwatak/satellite-js) by Shashwat
  Kandadai — MIT, vendored, SGP4
- [Natural Earth](https://www.naturalearthdata.com/) — public domain, coastline,
  boundaries and lakes
- [NOAA SWPC](https://www.swpc.noaa.gov/) — space weather, read live
- [CelesTrak](https://celestrak.org/) — amateur satellite elements, read live
- [SatNOGS DB](https://db.satnogs.org/) by the Libre Space Foundation —
  frequencies and modes, CC BY-SA 4.0, bundled as `data/transmitters.json`

## If you want more than this

Worldpane deliberately does less than the alternatives — it is one operator's
instrument rather than a dashboard for everyone. It exists because HamClock, by
Elwood Downey (WB0OEW, SK January 2026), showed what a shack display could be;
the original stops functioning in June 2026. It shares no code with it.

If you want the full article — DX cluster, dozens of panels, VOACAP — these
carry it on, and they are all good:

- [OpenHamClock](https://openhamclock.com) — hosted and open source, the
  heavyweight
- [HamPulse](https://hampulse.ca) — Apple TV and iPad
- [HAMSignal](https://apps.apple.com/us/app/hamsignal/id6760658659) — native iOS
  and iPadOS
- [Shane Burrell's dashboard](https://hamradio.shaneburrell.com) — browser-based,
  DX cluster and APRS
- [hamclock.me](https://hamclock.me)

## Licence

MIT for everything written here. The bundled libraries and map data carry their
own terms — see `LICENSE`, which lists each one and what was done to it. One
exception worth knowing about: `data/transmitters.json` comes from SatNOGS DB
and is **CC BY-SA 4.0**, not MIT. Share-alike attaches to that file and its
derivatives, not to the code that reads it.

73, KB4S
