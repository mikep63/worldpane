<!--
SPDX-FileCopyrightText: 2026 Mike Parker <mike@rsbl.org>
SPDX-License-Identifier: MIT
-->

# Design decisions

Settled decisions and the alternatives that lost, so they are not re-argued.

What belongs here: a choice where something else was seriously considered, and
the reason it was not taken. What does not: how the code works, which is what
the code comments are for; why a particular change was made, which is in the
commit that made it (`git log --grep`); what the data means, which is DATA.md.

If an entry here is ever reopened, edit it and say why rather than adding a
second entry that disagrees with the first.

This is **Worldpane** — an always-on amateur radio display for a wall-mounted
iPad: day/night terminator, sun times, and space weather, read from across the
shack.

**Status: first slice running as of 2026-08-28.** Settings, clocks, sun times
with the grey-line countdown, the terminator map, and the three NOAA numbers.
Satellites and the scheduled Action are still deferred. The About page shipped
2026-08-29.

`PLAN.md` is the historical record from when this was `bandwatch` — its research
is reusable and most of its decisions survive intact, but its name and platform
choice do not. Where the two disagree, this file wins.

**Checks.** Seven spec files run under the JavaScriptCore shell that ships with
macOS, since there is no `node` here:

```sh
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
for s in grid sun terminator map render globe graticule; do
  $JSC -m spec/check_$s.mjs || break
done
python3 -m http.server 8080     # then open http://127.0.0.1:8080
```

They check against physics and geometry rather than against previous output:
solstice declinations, 15°/hour subsolar drift, the terminator touching the
polar circles, and — the strongest one — the closed-form terminator agreeing
with astronomy-engine's solar altitude to within 0.02° across four dates.

---

# What changed since the shelving

## The product is a shack display, not a phone widget · 2026-08-27

`PLAN.md` built everything around the thesis that **"the widget is the actual
product"** — a home-screen glance, with the app as drill-down. That thesis is
dead, and with it the case for a native iOS app.

The reason is simply a different job. There is an **iPad 8th generation** that
needs a purpose, mounted in the shack and always on. A wall display does not
need a widget, because it is permanently visible; it does not need
notifications, because you are looking at it. Those were the two things the old
plan named as native-only ground, and neither buys anything here.

So the platform is a **static web page on GitHub Pages**, added to the Home
Screen, locked with Guided Access, Auto-Lock set to Never. That is the same
shape as `dxdial`, `astrotonight-web` and `baseball-records`, and it removes the
App Store, code signing, and a developer account renewal from a project only a
handful of people will ever run.

Rejected: **native SwiftUI**, which is what PLAN.md specified. It costs the
whole Xcode and signing pipeline and buys nothing for a device that never moves
and never sleeps. It also cannot be handed to another ham with a URL.

Rejected: **iPhone-first anything.** The old plan's fifteen-second sofa glance is
a real job, but it is not this job, and it is the job the competition is best at.

## The competitive position is worse than PLAN.md recorded · 2026-08-27

PLAN.md checked OpenHamClock and concluded the web lane was ceded. Since then
the lane has filled further, because Elwood Downey's death and HamClock's June
2026 shutdown started a land rush. As of 2026-08-27 there are at least six
successors, most free:

- **openhamclock.com** — React/Node, 30+ panels, hosted, still the heavyweight
- **HamPulse** (hampulse.ca) — explicitly *"Ham Radio Dashboard for Apple TV &
  iPad"*, terminator, NASA Blue/Black Marble, 20+ layers, VOACAP, DX cluster,
  satellites, plus a phone companion view
- **HAMSignal** (iOS, iPadOS 17+) — native, terminator overlay, band conditions,
  SFI and Kp every 15 minutes from NOAA
- **HamClock Pro**, **hamclock.me**, Shane Burrell's alternative — more web
  successors

**HamPulse is the same product for the same device**, and HAMSignal runs on this
iPad. There is no availability gap and no feature gap. This is being built
anyway, knowingly, because it is enjoyable and because a station instrument
shaped to one operator is a different thing from a dashboard shaped to everyone.

**Do not let the About page claim otherwise.** Link all of them, prominently,
the same way PLAN.md already requires for HamClock's continuations.

One PLAN.md open question is now closed: *"Confirm openhamclock's browser build
is real."* It is real, hosted, and live.

## CORS is not a constraint, because of a decision already made · 2026-08-27

Recorded because it was got wrong once, on this project, this week.

Testing the data sources directly from a browser gives a discouraging answer:

| Source | Direct browser fetch |
|---|---|
| NOAA SWPC (`services.swpc.noaa.gov`) | ✅ `access-control-allow-origin: *` |
| CelesTrak amateur TLEs | ✅ `access-control-allow-origin: *` |
| hamqsl.com (N0NBH) solar XML | ❌ no CORS header |
| prop.kc2g.com MUF/foF2 | ❌ no CORS header |

That table led to the conclusion that the two propagation sources hams most
associate with HamClock were unreachable. **It is irrelevant.** PLAN.md's static
data layer already routes around it: a scheduled GitHub Action fetches and
normalises server-side, commits static JSON, and the client reads only files
served from its own origin. Nothing the client does is cross-origin at all.

The general rule, worth keeping: **a CORS test only answers the question for a
client that fetches directly.** Check the architecture before testing the wire.

The one thing this does not rescue is the **DX cluster**, and not for CORS
reasons — telnet is a raw TCP socket a browser cannot open under any
circumstances. A scheduled job *could* hold that connection, which is exactly
what PLAN.md rejected on maintenance grounds. That rejection still stands; see
below.

---

# Product and data

Binding on every client, this one and any other.

## The name is Worldpane · 2026-08-28

Renamed from `bandwatch`. The head noun is Pane and the modifier is World: it is
the world on a pane of glass, which is literally the object hanging on the shack
wall.

Chosen partly for being **scope-neutral**, which is the failure `bandwatch` was
retired for. A worldpane is whatever is drawn on the pane, so satellites in v2
do not strand the name, and neither does switching from an equirectangular map
to an orthographic globe — a globe on a pane is still a worldpane.

**The niche's taken morphemes, as of 2026-08-28:** `Ham-` (HamClock, HamPulse,
HamWatch, Hambands, HamSolar), `DX-` (DXDial is ours, but DXChrono shipped a
shack wall display in August 2026), `-Clock` (HamClock, Helioclock, DXChrono),
`-Watch`, `-Pulse`, `Shack-`, `Helio-`, `-Map`. Anything built from those sits
beside a competitor.

Rejected:

- **bandwatch** — its own PLAN.md already flagged it as reading narrower than
  the app. Worse, it sits between **HamWatch** and **Hambands** in the same App
  Store category, and pays a permanent typo tax to **Brandwatch**.
- **Shackmap** — `shackmap.app` is live and its meta description reads *"a
  modern ham radio dashboard with 4K cartography"*. Exact name, exact niche.
- **Shackglass**, **Shackglobe** — both test clean individually and all their
  domains are free. Rejected anyway: ShackMap makes `Shack-` a taken *pattern*
  here, and reading as a sibling of a direct competitor is the same fault that
  retired bandwatch. **Screen the pattern, not just the string.**
- **Graypane** / **Greypane** — the best domain signal of any candidate, since
  "gray" says grey line to a ham instantly. Killed by orthography: this
  repository spells it **gray** (8 occurrences, 0 of "grey"), and
  `graypane.com` is registered while `greypane.com` is free. Owning the
  spelling you never use is the worst configuration available.
- **Grayline** — Gray Line Worldwide, a sightseeing brand founded 1910 with
  400+ destinations and 100+ licensees.
- **Dayedge** — clean, and "the edge of day" is exactly what a terminator is.
  But it names only the hero panel, which is bandwatch's mistake repeated, and
  the .com is parked.
- **Dayline** (several App Store apps plus a Japanese logistics firm),
  **Sunclock** (apps on iOS, Android, Windows, and the classic X11 one),
  **Longpath** (LongPath Technologies, Long Path Tool, Longpath Labs),
  **Gloaming** (`gloaming.app` and `.com` are a live Brazilian company),
  **Gridglobe** (`gridglobe.com` is Grid & Globe travel), **Orrery** (heavily
  used by astronomy apps specifically), **Halfworld** (game and book
  collisions), **Subsolar** (.com and .app both live; also reads as a
  solar-power product), **Nightside** (Steam game, `.app` on Vercel, and it
  names only half the thing).

Accepted weakness: **it does not signal amateur radio** the way DX does in
DXDial. With `Ham-`, `DX-`, `Shack-` and `-Map` all taken here, that signal is
not available without standing next to a competitor. The clean name is worth
more than the signal.

It would become wrong if the map ever stopped being the centre.

`worldpane.com` and `worldpane.app` were both free at time of writing. The
directory was renamed from `bandwatch/` on 2026-08-28, before there was any code,
any git history, or any published URL — which is the only moment a rename is
free. `PLAN.md` keeps the old name throughout as the historical record.

## Settings exist, and location is still a grid square · 2026-08-27

PLAN.md hardcoded nothing but assumed one operator. This ships a **settings
page** so another ham can use it: grid, callsign, bands, units.

That does not relax the location rule, which stays exactly as PLAN.md wrote it
and as it binds every app on this shelf:

**The app asks for a Maidenhead grid and nothing else.** No address, no
postcode, no city lookup, no geocoding field. Every ham knows their grid, it is
printed on QSL cards and published openly on QRZ, and typing `FM17` needs no
permission prompt — which for a wall display is decisive, since there is nobody
present to answer one.

**Accept 4, 6 or 8 characters, prefer 6, and say why.** `FM17` is about 176 km
across at this latitude, which spreads sunrise over roughly eleven minutes —
real error for grey-line work, which is played in minutes. `FM17ax` narrows it
to about 7 km and well under a minute. Take 4 if that is all someone knows and
use the square's centre.

Settings persist in `localStorage`, wrapped in try/catch, with defaults merged
over whatever is found — a private window or cleared site data must render a
working page, not a broken one. There are no accounts and no server, so there is
nothing to sync and nothing to leak.

Rejected: **geolocation**, even as a convenience. PLAN.md allowed CoreLocation
for portable work on a phone. A wall-mounted iPad never moves, so the permission
prompt is pure cost.

## A gear icon, opening a settings page · 2026-08-27

One gear in a corner of the dashboard. Tapping it opens a settings page. A clear
way back to the dashboard, and no other chrome anywhere on the display.

A hash route (`#/settings`), matching `astrotonight-web`'s per-target detail
view, so the two pages are one file and the back path is the browser's own.

Fields, in order of how often they change — which is to say, almost never:

| Field | Notes |
|---|---|
| Callsign | Display only. Shown on the dashboard; nothing is sent anywhere |
| Grid | 4/6/8 characters, 6 preferred. The only location input there is |
| Theme | Auto / light / dark, defaulting to auto |

**Bands and units were cut on 2026-08-28.** Both were carried over from a
version of this that had band conditions in it, and in v1 neither controls
anything: the display is a terminator, two clocks, sun times, and three solar
numbers, none of which is band-specific and none of which shows a distance. A
setting that changes nothing teaches the reader the settings page is decorative.

Bands return when there is something band-specific to show. Units return when
something on screen has a distance — and then they follow DXDial: miles by
default, kilometres available.

Rejected: **hiding it behind a gesture.** An always-on display gets bumped by
sleeves and visitors, and the first instinct was to make settings hard to reach
by accident. But an undiscoverable gesture is worse than a stray tap: it fails
the person setting the thing up for the first time, which for a page meant to be
handed to another ham is the one moment that has to work. A stray tap costs one
tap to undo. **Guided Access is the right place to lock the screen down, not the
interface** — it can restrict touch areas at the OS level without making the app
worse for everyone who isn't wall-mounting it.

Rejected: **a settings panel overlaying the dashboard.** On a display read from
three metres there is no room for a drawer, and a half-covered dashboard behind
a modal is worse than a clean second page.

## What is deliberately not built · 2026-08-17, reaffirmed 2026-08-27

Carried from PLAN.md unchanged. Each was considered and rejected on the
maintenance test — *what happens to this feature if nobody touches the repo for
a year?* — not overlooked.

- **DX cluster / telnet / skimmer spots.** Needs a live socket a scheduled job
  must babysit, plus cluster etiquette risk against Mike's own callsign, plus a
  callsign-to-location resolver HamClock itself declined to build. Highest
  breakage surface of anything proposed. The account at `dxspots.com:23` is a
  live personal account and its settings are not to be touched.
- **WSPR aggregation via wspr.live.** Good data, real coverage-bias problem that
  must be solved correctly or the app lies, licensing obligation to keep results
  public, and a dependency on one volunteer's database.
- **VOACAP / propagation prediction.** A monthly-median model shown beside
  measurements invites reading it as a nowcast.
- **Logging, rig control, contest calendar, QSL/LoTW, repeaters, APRS,
  terrestrial weather.** Solved better elsewhere, or needing accounts and
  servers this deliberately has none of.

If any return, they return *after* the small version has shipped and survived a
year.

## Staleness is always visible · 2026-08-17

A failed fetch leaves yesterday's file in place, so the display degrades to
*stale* rather than *blank*. Every panel says how old its data is. That is the
mechanism that makes "stale rather than blank" honest rather than a lie of
omission — and on an unattended display that runs for months, it is the single
most important piece of the interface.

---

# The web app

This client only.

## No build step, no dependencies · 2026-08-27

Plain HTML, CSS and native ES modules, as in `astrotonight-web`. This machine has
no `node`. iPadOS Safari on an 8th-generation iPad handles modules, grid, and
`fetch` without help.

Two pieces of maths, both already owned:

- **Sun position, twilight, terminator.** `astrotonight-web` already vendors
  astronomy-engine (MIT, zero dependencies, ESM) and `astrotonight-ios` has the
  fixture-validated `AltAzCalculator`. The subsolar point and the terminator are
  the same maths pointed at a different question. Carry a `spec/` fixture across
  so the two stay honest.
- **Maidenhead grid ↔ lat/lon.** Thirty lines, needed in both directions.

## Draw the map, do not import one · 2026-08-17

Natural Earth coastlines (public domain), simplified and bundled. No MapKit, no
tiles, no mapping library. An equirectangular grey-line map is one projection
function and a coastline path.

Tiles would also mean every user hitting somebody's tile server, which the
privacy position rules out.

## Flat equirectangular, not a globe · 2026-08-28

Lat/lon maps straight to x/y. No hemisphere clipping, no limb handling, and it
is the look every ham reads without thinking.

Rejected: **an orthographic globe centred on the operator's grid.** Barely more
code, better-looking as an object on a wall, and it would have made the
personalisation visible. But it shows one hemisphere, which hides the far-side
terminator — and for grey-line work the terminator's position relative to the
*target* is the whole point, since that is where the long-path opening is. A
display that cannot show the opening you are waiting for fails at its main job.

Rejected: **both, switchable.** Two projection functions and a second code path
to keep working, against the standing test of what survives a year of neglect.

## The globe is back as a spike, undecided · 2026-08-29

`js/globe.js` and `spec/check_globe.mjs` exist and the setting is live, default
flat. **This is not a decision** -- it is on disk to be looked at on the iPad
before the paragraphs above are either amended or left standing.

What changed: the globe turns. Drag it and the far side comes round, which
answers the hemisphere objection on its own terms. What did not change: turning
it is an interaction, and this display is read from three metres by someone who
is not touching it. A rotatable globe answers "show me the terminator at my
target" with "come here and drag", where the flat map answers it with a glance.
That is why flat is still the default and why the rejection above has not been
struck out.

Three things the spike settled, whichever way the decision goes:

- **The night side needs its own geometry.** `terminator.nightPolygon` closes
  along the dark pole, which is meaningless on a hemisphere -- the far side
  projects onto the same disc and the polygon folds over itself. The globe
  builds its region from the visible half of the terminator great circle
  stitched to an arc of the limb. The visible half is exactly a half-turn,
  because depth along the view axis is one sinusoid in the parameter, so there
  is nothing to scan for. Taking the *wrong* limb arc gives a plausible-looking
  globe with the lit and dark halves swapped, and no amount of looking at one
  orientation catches it -- hence the 39,200-point fill classification check in
  `spec/check_globe.mjs`.
- **Vertices are cached as unit 3-vectors, not pixels.** The flat map's
  load-time projection cache and pre-painted basemap cannot survive rotation.
  Caching the trigonometry instead makes a frame a 3x3 multiply per vertex, and
  it is resolution-independent -- the globe is the one thing here that does not
  need rebuilding on resize. The coastline is thinned to every sixth vertex
  while a finger is down and restored the moment it lifts.
- **A turned globe must come home.** Ninety seconds after the last touch it
  animates back to the operator's grid. Without it, one brush against the glass
  -- and Guided Access means the whole screen is the map -- leaves the display
  showing the wrong hemisphere until somebody notices.

The open question is not correctness, it is **the layout**. The globe is drawn
inside the flat map's 2:1 box so that switching views does not move the numbers,
which leaves it half the width of the flat map with empty flanks either side.
Either the globe gets a squarer box and the strip is redesigned around it, or
the flanks earn something, or the globe is not worth it. Decide that on the
device.

## The map data is 50m coastline at 2dp · 2026-08-28

`ne_50m_coastline` from Natural Earth, coordinates rounded to two decimal places
in the build step.

The sizing argument, recorded so it is not re-derived: the iPad is 2160×1620
physical, so a hero map about 1512 px wide gives **4.2 pixels per degree** — one
pixel is roughly **26 km** at the equator. Against that:

| Scale | Raw | Vertices | At 2dp, gzipped |
|---|---|---|---|
| 110m | 137 KB | 5,128 | 27 KB |
| **50m** | 1.6 MB | 60,416 | **261 KB** |
| 10m | 9.9 MB | 410,957 | ~1.7 MB |

110m spaces vertices 0.5–1° apart, which is 2–4 px here and visibly angular up
close. 10m is about 270 vertices per pixel column, which is absurd. 50m is
sub-pixel smooth.

**Quantisation is the lever, not the scale.** Raw Natural Earth carries six or
more decimal places — 0.1 m precision, on a map where a pixel is 26 km. Two
decimals is 1.1 km, still 24× finer than a pixel, and takes 50m from 1.6 MB to
261 KB gzipped. Do it in Python at build time and commit the result; never ship
the raw file.

Draw cost does not enter into it: paint the coastline once to an offscreen
canvas and redraw only the terminator overlay. Vertex count then affects load
alone.

The `coastline` file, not `land` — lines rather than filled polygons. `land`
would have been the right choice for a globe.

## Borders, lakes and a grid · 2026-09-02

Three layers over the coastline: country boundaries, the 44 largest lakes, and
the Maidenhead field grid. Each is a `{ scale, lines }` payload of the same
shape as `coastline.json`, so both projections decode all four layers with the
decoders they already had. The flat map projects them into the same pre-painted
basemap; the globe caches them as unit vectors alongside the coastline.

| Layer | Source | Vertices | Gzipped |
|---|---|---|---|
| Coastline | `ne_50m_coastline` @ 2dp | 60,392 | 250 KB |
| **Borders** | `ne_50m_admin_0_boundary_lines_land` @ 1dp | 15,594 | **39 KB** |
| **Lakes** | `ne_50m_lakes`, `min_zoom <= 2` @ 2dp | 6,604 | **25 KB** |
| **Field grid** | generated | 3,155 | **0** |

**Borders quantise to 1dp, not the coastline's 2dp.** 0.1° is 11 km against a
26 km pixel — still finer than the display can resolve, and a border is mostly
geodesic straight lines that lose nothing to it. A coastline is fractal all the
way down and does not survive the same treatment. This is "quantisation is the
lever, not the scale" taken one notch further, and it halves the file.

**The `boundary_lines_land` layer, not `admin_0_countries`.** It carries land
boundaries only — coastal borders are excluded by construction — so it is
exactly complementary to the coastline with no duplicated ink. The polygon
layer would have redrawn every coast a second time.

**Disputed boundaries are dashed, not filtered.** Natural Earth flags 35 of its
390 segments `Disputed`, `Line of control`, `Indefinite` or `Indeterminant
frontier`. Drawing them identically to settled borders states a position the
source itself declines to take.

Rejected: **shipping only the 355 settled boundaries.** It sounds neutral and
is not. The flagged segments cluster — 13 across Kashmir and northern India,
6 around Israel and Palestine, 4 in the Horn of Africa — so filtering leaves a
conspicuous 40–60 px hole along the top of India and gives Israel no eastern
border at all. That invites the question rather than avoiding it, and costs
904 vertices to avoid.

Rejected: **choosing a point of view.** The file carries per-country fields
(`FCLASS_US`, `FCLASS_CN`, `FCLASS_IN`, and thirty more) that would let the map
take one government's line. A shack display has no business doing that, and the
feature has no end to it.

**Lakes are filtered by Natural Earth's own `min_zoom`, at 2.0.** That keeps 44
of 412 — all five Great Lakes, Baikal, Victoria, Tanganyika, Malawi, Chad,
Titicaca, Balkhash, the Aral remnants — and drops 368 reservoirs and ponds that
would be sub-pixel smears. This is the layer that fixes something *wrong* rather
than adding detail: without it North America has a blank middle. The Caspian is
absent from this layer because Natural Earth classes it as a sea; it is already
in the coastline, and was checked rather than assumed.

**The field grid is generated, and it is the only ham-specific overlay here.**
Eighteen fields of 20° by 10°, lettered A to R — the first pair of any locator.
It ships as zero bytes because it is arithmetic. It samples at 3° because the
globe has to walk a meridian as a curve; the flat map pays for the samples once
into the basemap and does not care. Eighteen meridians rather than nineteen:
180E and 180W are the same line. Seventeen parallels rather than nineteen: the
two at the poles are points.

Rejected: **a label in every cell.** 324 two-letter labels are illegible at the
three metres this display is designed for and noise at any distance. The
letters run along the top and left edges instead, which still names any cell by
reading across and down, and they are a walk-up detail by design — the *lines*
are what carry the field structure across the room.

Rejected: **labels on the globe.** They would have to track the rotation, and
the two edges they hang off do not exist on a hemisphere.

**The hierarchy is carried by contrast, not weight.** At one device pixel there
is nothing left to thin, so each step down the stack steps toward the day
colour. Draw order is bottom-up in the same sequence, so the coastline stays the
line the eye finds first.

| | coast | lake | border | disputed | grid | labels |
|---|---|---|---|---|---|---|
| Contrast vs `--map-day` | 3.9:1 | 3.3:1 | 2.8:1 | 2.2:1 | 2.0:1 | 3.0:1 |

**The bottom rung is the constraint, not the top** — learned by getting it
wrong on the first pass. Stepping a fixed amount toward the background each time
runs out of visible range before it runs out of layers: the grid landed at
**1.24:1** and the disputed borders at 1.6:1, which is not subtle, it is absent.
The switches worked perfectly and looked broken, because ticking a box drew
something nobody could see. Nothing goes below 1.9:1, and any future layer has
to fit inside the ladder rather than extend it downward.

Labels carry their own value at 3.0:1 rather than the grid's 2.0:1. Small text
needs more contrast than a long line to read as equally present, and the letters
are already the one part meant to be read close up.

**Two switches, not one and not four.** Borders and inland water are a single
decision about how much cartography the map carries; the grid is an operating
aid and a different thing to want on screen. Both default on.

Rejected: **state and province lines** (`ne_50m_admin_1`, 581 features, 68 KB).
Readable at 4.2 px/degree and still wrong: it is ink that competes with the
coastline at the distance this display is actually read from.

Deferred: **the overlays make the missing service worker worse.** Each layer is
another fetch that fails on a reload with no network. They fail softly — a
missing overlay costs its own layer and nothing else, unlike the coastline —
but there are now three files to cache instead of one.

## The About page credits by choice, not obligation · 2026-08-29

Worldpane contains no HamClock code, data or assets, so nothing is owed to it.
The obligations that do exist are met: astronomy-engine's MIT notice ships
embedded in `vendor/astronomy.js`, and Natural Earth and NOAA SWPC are both
public domain.

The page credits Elwood Downey anyway, in one sentence of lineage rather than a
homage. It is true -- the project exists because HamClock defined what a shack
display is -- and after his death in January 2026, with a scramble of successors
following, silence would read as quietly reimplementing a dead man's project.
The credit costs one sentence and forecloses that reading entirely.

Rejected: **"based on HamClock"**. False. There is no shared code.

Rejected: **dropping the credit because the build is unique**. It is unique, and
the sentence is about where the *idea* came from, not the code.

The links to the successors are the half that earns its place, and they are not
attribution at all -- they exist so someone who lands here wanting a DX cluster
and satellites reaches a project that has them instead of a dead end. Five are
listed and each was checked live on 2026-08-29: openhamclock.com, hampulse.ca,
HAMSignal on the App Store, hamradio.shaneburrell.com and hamclock.me. HamClock
Pro is named in the survey above but is not linked, because no URL for it could
be confirmed and a broken link serves nobody.

## Theme is a setting, defaulting to auto · 2026-08-28

Auto means light in daylight and dark after sunset **at the operator's grid**,
driven by the sun calculation the map already performs. No extra data, no extra
dependency, and the display matches the room without a light sensor.

Light and dark are designed as equals, not one inverted into the other. This
thing is looked at all day and all night and spends half its life in each.

Rejected: **dark always.** Conventional for an instrument and simplest, but
harsh in a bright daytime shack — which is when it is most often glanced at.

Rejected: **leaving it to iOS auto-brightness.** That adjusts the backlight, not
the palette, and a dark palette in a sunlit room stays a dark palette.

## Legible across a room, not in a hand · 2026-08-27

The display is read from two or three metres, in a room whose lighting changes.
That is a different design problem from a phone and drives every layout choice:
large numerals, high contrast, no hover states, no small tap targets, nothing
that requires reading a label to interpret a number.

It also runs for months at a time, so nothing may accumulate — no unbounded
arrays, no growing DOM, no leak that shows up on day forty.

## Map on top, numbers underneath · 2026-08-28

The iPad is 1080×810 points in landscape. An equirectangular world map is 2:1,
so at full width it is 1080×540 and leaves roughly 270 points beneath — which is
the layout falling out of the projection rather than being imposed on it.

- **Map**, full width across the top, 2:1. Terminator, and the operator's grid
  marked.
- **Strip** beneath it, in three groups: clocks (UTC and local), sun times and
  the grey-line countdown, and the three solar numbers.
- **Gear** in a corner. Nothing else.

Expressed as proportions with flex or grid, never fixed pixels — standalone mode
loses a little height to the status bar, and the same page should be legible on
a desktop browser while being worked on.

Rejected: **a side rail of numbers.** It shrinks the map to make room for text,
and the map is the reason the thing exists.

## First run shows the settings page · 2026-08-28

With no stored grid there is nothing truthful to draw, so the first load opens
`#/settings` with the grid field empty and one line saying why. Once a grid is
saved the dashboard is the entry point and settings are only reachable by the
gear.

Rejected: **defaulting to a grid.** Any default is somebody else's location, and
the failure is silent — the map and every sun time would be confidently wrong,
which is worse than an empty state that asks a question. Geolocation is already
rejected elsewhere for the permission prompt.

## The grey line is +2° to −8° solar altitude · 2026-08-28

The countdown needs a number and the physics does not supply one, so this is a
convention and should be labelled as one.

The band runs from the sun **2° above** the horizon to **8° below**, at the
operator's grid. That starts a little before sunset, covers civil twilight
(0° to −6°) where D-layer absorption has decayed while the F layer is still
ionised, and stops early in nautical twilight. Roughly 40–70 minutes depending
on latitude and season, which matches how the term is used on the air.

astronomy-engine's `SearchAltitude` finds both crossings directly, so this is
two calls rather than a scan.

The number is arguable and someone will argue it. What matters is that the app
states which convention it uses rather than presenting a countdown as though the
boundary were physical.

## Grey line is geometric altitude; sunrise is not · 2026-08-28

Two altitude conventions live side by side, deliberately. Found while building,
because the first version searched for one and measured the other.

**The grey line uses geometric altitude.** `SearchAltitude`, which solves every
grey-line time, works geometrically: ask it for 2° and the instant it returns is
2.0000° geometric but **2.28° apparent**, because `Horizon(…, 'normal')` adds
refraction. Measuring with refraction on would mean the window did not begin
where the convention says it does. Beyond the arithmetic, refraction bends the
light an observer sees; it does not move the boundary of solar illumination in
the ionosphere, which is what the grey line is about.

**Sunrise and sunset keep the standard refracted definition** — upper limb,
refracted, which `SearchRiseSet` places at about **−0.83° geometric** (−0.567°
refraction plus −0.267° of solar semidiameter). Quoting sunrise any other way
would disagree with every almanac and weather app the reader owns.

So the same screen shows a grey line measured one way and a sunset measured
another. That is correct, and both are pinned in `spec/check_sun.mjs` so a
later tidy-up that unifies them fails loudly.

Rejected: **making both apparent.** It would put sunrise back where people
expect it but leave the grey-line window starting at a stated 2° that is really
2.28°, which is the error that was there to begin with.

---

# Deferred, not decided

Roughly in the order they should be taken. The first is a gap in what has
already shipped rather than a new feature, which is why it comes before
satellites.

- **No offline caching, which a wall display eventually needs.** A page already
  loaded survives a network drop: sun times and the terminator are pure local
  maths, and space weather degrades to stale by design. But a **reload** without
  network fails — `map.js` fetches `data/coastline.json`, and without it the map
  is replaced by "Coastline unavailable". Since 2026-09-02 there are three files
  to cache, not one, though only the coastline is fatal. For something meant to
  run unattended
  for months on shack wifi, a service worker caching the shell and the coastline
  closes the last real fragility. `baseball-records` already does this; copy its
  shape rather than inventing one.
- **No README, and the repository is public.** Anyone who finds it gets no
  explanation of what it is or how to run the checks.
- **Satellites.** PLAN.md made them the feature that earned a home-screen slot,
  which was a phone argument. On an always-on display they are most of the code
  and the least of the glanceable value. CelesTrak's amateur group is CORS-open
  and returns **96 satellites**; near-Earth SGP4 stays the right scope when it
  happens.

  PLAN.md's sub-question survives and is still open: **which satellites ship by
  default?** Its own answer was ISS, the SO-50/AO-91/AO-92 class, and the current
  linear transponders, with the rest opt-in — the full amateur set is long and
  mostly uninteresting.
- **hamqsl and prop.kc2g.com licensing.** Now reachable via the Action, but
  reachable is not the same as permitted. N0NBH publishes the solar XML for
  embedding; republishing a normalised derivative is a different act. Check
  terms with both before shipping either.
- **Whether the Action is needed at all.** The first slice did not need it:
  everything is either pure maths or a CORS-open NOAA endpoint, the largest of
  which is **47 bytes**. It becomes insulation worth having once TLEs and a
  second source are in play — and CelesTrak explicitly asks not to be hammered
  by many individual clients, which is an argument that only starts to apply
  when more than one person is running this.
- **Bands return to settings when there is something band-specific to show.**
  Recorded in "A gear icon" as the condition for undoing that cut. The obvious
  trigger is a band-conditions readout derived from SFI and Kp — honest if
  labelled as derived, and it would give the setting meaning. Declined for v1 as
  beyond the first slice, not rejected.

**Closed rather than pending**, so they are not picked back up: PLAN.md's
**widget sizes** and **notification policy** both died with the phone-widget
thesis, and its question about **openhamclock's browser build** is answered — it
is real, hosted and live.

---

# First slice

Settings (callsign, grid, theme), clocks, sun times with the grey-line
countdown, and the terminator map.

No network beyond three tiny NOAA endpoints, nothing blocked by any open
question, and largely a port of maths that already exists and is already
fixture-validated. The verified endpoints:

| Endpoint | Size | Gives |
|---|---|---|
| `products/summary/10cm-flux.json` | 47 B | Solar flux |
| `products/noaa-planetary-k-index.json` | small | Kp, with trend |
| `json/goes/primary/xray-flares-latest.json` | 419 B | Current X-ray class |

All three are CORS-open, so v1 can fetch them directly and defer the Action.

Show the numbers **with a trend** — "K 2, down from 5 overnight" is information;
"K 2" is trivia. That was PLAN.md's rule and it survives.
