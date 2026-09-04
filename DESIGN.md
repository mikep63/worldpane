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
The scheduled Action is still deferred. The About page shipped 2026-08-29, it
has run offline since 2026-09-02, and the next satellite pass since 2026-09-03.

`PLAN.md` is the historical record from when this was `bandwatch` — its research
is reusable and most of its decisions survive intact, but its name and platform
choice do not. Where the two disagree, this file wins.

**Checks.** Thirteen spec files run under the JavaScriptCore shell that ships with
macOS, since there is no `node` here. Run them from the repository root —
`check_sw.mjs` reads files relative to the working directory:

```sh
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
for s in grid sun terminator map render globe graticule symbols spacewx bands satellites skyplot sw; do
  $JSC -m spec/check_$s.mjs || break
done
python3 -m http.server 8080     # then open http://127.0.0.1:8080
```

They check against physics and geometry rather than against previous output:
solstice declinations, 15°/hour subsolar drift, the terminator touching the
polar circles, and — the strongest one — the closed-form terminator agreeing
with astronomy-engine's solar altitude to within 0.02° across four dates. The
exception is `check_sw.mjs`, which checks the precache list against the disk and
carries the cache-name bump — when it fails it prints the line to paste.

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

**Reopened and held, 2026-09-03.** Asked again after a week that added
satellites, pass prediction, a sky plot, transmitter frequencies, band
conditions and offline caching — and every one of those turned out to be
arithmetic and static data. None needed a native capability, which is a week of
evidence for the web case rather than against it.

The checkable part of the argument also moved the wrong way for native. Most of
what a native app is reached for, Safari already does here: offline, chrome-less
launch from the home screen, persistent storage, canvas, and even a live compass
heading through `DeviceOrientationEvent.webkitCompassHeading`. What remains
genuinely native-only is notifications while closed, widgets and StandBy, rig
control over Bluetooth or CAT, and running with the screen off — and this entry
already answers the first, because you are looking at a wall display.

Two things would reopen it properly, and neither has happened: **pass alerts
away from the shack**, which a passive page structurally cannot do, or
**portable operating** with a compass-locked sky plot. The second is already
half-served, since the same page installs on an iPhone today. If either does
arrive, the right answer is a portable satellite companion as its own product —
not a port, and not two terminators to keep in sync.

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

## Recovering is a different job from refreshing · 2026-09-03

Space weather refreshes every fifteen minutes and element sets every twelve
hours. Those are the right cadences for keeping data current and hopeless ones
for a first attempt that failed, which is exactly what happens when the iPad
wakes before its wifi has associated — every time the shack powers up. The
display sat with empty tiles for a quarter of an hour and said "Satellites
unavailable" for **half a day**, with nothing wrong but one lost fetch.

So a failed attempt now books its own retry, backing off 30 s, 1, 2, 5, 10
minutes. The cap sits **below** the fifteen-minute refresh interval, so a source
that is genuinely down settles into polling rather than escalating. Coming
`online` resets both and retries at once, because that is the one signal a
backoff cannot anticipate — an operator who has just fixed the wifi should not
then wait out a ten-minute timer.

Space weather retries only when **nothing at all** arrived, which is what a
missing network looks like. One endpoint being down is not worth a backoff loop:
the normal cadence collects it and the panel already says that reading is stale.

Found on the wall, not in a check. The failure needs a display that starts
without a network, which is the normal case for the actual product and the
abnormal one for every way it had been tested.

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

## Offline is a precached generation · 2026-09-02

`sw.js` precaches all seventeen files — shell, modules, and the three layer
files — and serves them cache-first with no revalidation. A reload with no
network now draws the world; before this it drew "Coastline unavailable", which
on a display meant to run unattended for months made an overnight router reboot
into a dead map.

The word that matters is **generation**. Assets are replaced together by an
install or not at all, never one at a time, and the install fetches with
`cache: 'reload'`. That is also the fix for the second problem: GitHub Pages
serves assets with a 600-second cache and can hand a browser a fresh
`index.html` against a stale `main.js`.

**The display updates itself, because it can never navigate.** A worker only
looks for a new version when the page navigates, and a kiosk pinned to a wall
under Guided Access never does — left alone it would run the generation it was
installed with until somebody walked over and quit it by hand, which fails the
standing test of what survives a year of neglect. So the page calls
`registration.update()` hourly, and on `online`, and reloads itself when a new
worker takes control. Abrupt is safe here precisely because a generation swaps
atomically: there is no half-updated state to land in.

The reload is guarded twice — against the very first install, where a worker
claiming an uncontrolled page fires the same event an update does and would
loop, and against reloading more than once.

The cache name is a **digest of the precached files**, computed by
`spec/check_sw.mjs`, which fails when the two disagree and prints the line to
paste. Rejected: **a hand-bumped version number.** Forgetting it has no symptom
— the display keeps working, on the old code, forever — and "what survives a
year of neglect" is the standing test. A digest cannot be forgotten because the
check fails.

Rejected: **stale-while-revalidate**, which needs no version at all and heals
itself a reload later. It revalidates each asset independently, so a reload
after a deploy can pair a new `index.html` with an old `main.js` — which is the
exact failure the generation exists to end. It would also re-fetch 870 kB on
every reload over shack wifi.

Rejected: **generating `sw.js` from a script**, which is how `baseball-records`
builds its list. There is no build step here, and seventeen paths that change a
few times a year do not need a generator — they need a check, which is cheaper
and catches more.

Rejected: **caching the NOAA responses.** Space weather is the one thing that
*should* fail with the network down: `spacewx.js` keeps the last reading and the
panel says how old it is. A cache would turn an honest stale number into an
invisible one, against "Staleness is always visible". Cross-origin requests are
passed straight through.

Two smaller departures from `baseball-records`, whose shape this otherwise
copies: `sw.js` does not precache **itself** — the browser refetches it on
navigation and that is the escape hatch out of a bad generation — and `./` is
not precached **alongside `index.html`**, since one navigation fallback covers
every in-scope URL without keeping two copies of the same file. It is a classic
worker rather than a module, because module workers landed in Safari 16.4 and
this runs on whatever iPad was spare.

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

## The Sun and the Moon are marked, plainly · 2026-09-02

Two filled discs: the point with the Sun overhead, and the point with the Moon
overhead. Both projections draw them, and on the globe they disappear round the
back for free — `drawMarker` already refused to draw a point on the far
hemisphere, which is the only thing that made the station marker correct there.

They are drawn **over** the night fill rather than under it. The sublunar point
spends more than half its time on the dark side, and a marker at 38% of its
colour is one you have to hunt for. The station is drawn last of the three, so
it is never the mark that gets covered.

Drawn last, but **not drawn largest**, and that was looked at and accepted on
2026-09-03 rather than being an oversight. The two sky marks carry detail — rays
and a phase — and detail needs radius; the station needs none, because a
position is all it has to say. So the operator's dot is the smallest and plainest
mark on the map while sitting on top of the other two. An earlier draft of this
entry claimed the station outranked the sky, which the pixels contradicted; the
claim was wrong, not the drawing.

**Reopened the same day, before it had been on the wall an hour.** Two coloured
discs told a reader there were two bodies but not which was which, so the
display needed a legend — and a legend is an admission that the picture failed.
Symbols identify themselves instead: the Sun is a disc with eight rays, and the
Moon is an outlined disc with its lit fraction filled. Both grew, because a
phase you cannot resolve is a circle again and detail costs pixels. They live in
`js/symbols.js`, apart from both projections, since the flat map and the globe
have to draw the same mark and two copies would drift.

The Moon's **rim is always drawn and the fill is not**, which is what makes it
survive both ends of the month: a full Moon is a filled ring, a new Moon an
empty one, and neither can be mistaken for the Sun once the Sun has rays. A
literal phase with no rim would have vanished at new and turned back into an
ambiguous white disc at full — the two nights a month when a legend would have
been needed most.

Lit limb on the right while waxing, on the left while waning. That is the
northern-hemisphere naked-eye view, so it is a **convention and not a fact** —
from Sydney it is inverted. Recorded as a choice because the alternative,
orienting the crescent toward the subsolar point, is defensible and was not
taken: it is correct from everywhere and recognisable from nowhere, since a
crescent lying on its back does not read as a moon.

Colour still does the first work — warm for the Sun, pale for the Moon, against
a `--station` that is neither — with shape behind it and size behind that.
Sizes were set by eye and should be retuned the same way, on the wall rather
than in a desktop browser.

Worth being honest that the two markers are not equally useful. The **Sun** is
close to redundant: the terminator already says where it is, since the subsolar
point is just the centre of the lit half. It earns its place by being faster to
read than a boundary, not by being new. The **Moon** is genuinely new — nothing
else on the display carries it, and for EME the sublunar point is the geometry
that sets the mutual window.

Rejected: **shading where the Moon is up.** A second great-circle region over
the map, competing with the terminator that is the reason the map exists.

Rejected: **the sublunar coordinates in the caption.** It already carries the
subsolar point, and a second pair of numbers at that size is not something
anyone reads at three metres.

`spec/check_symbols.mjs` holds the phase geometry to the four phases anyone can
look up, and to the symmetry either side of full — a sign error there would draw
a waxing Moon all month without ever looking broken. What it cannot check is
whether the thing reads as a moon at three metres, which only a person standing
across the room can answer.

The sublunar point is checked in `spec/check_sun.mjs` against the Moon's own
phases rather than an almanac: its subpoint nearly coincides with the Sun's at
new moon and is nearly antipodal at full, it stays inside the ±28.6° that the
obliquity and the orbital inclination allow, and it drifts west more slowly than
the Sun — which is the one test a copy-paste that left `Body.Sun` in place
cannot pass.

## Satellites are a countdown, not a panel · 2026-09-03

One line of text in the Sky pane: **"ISS in 46 min, peak 11°"**. That is the
whole feature.

PLAN.md made satellites the thing that earned a home-screen slot, which was a
phone argument, and the deferred entry that replaced it warned they were "most
of the code and the least of the glanceable value". Both are answered the same
way. The glanceable question is *is anything coming over soon* — footprints,
ground tracks and pass tables are answers to questions you ask sitting down, at
a computer, with time. A wall display gets asked from across the room.

It sits under the grey line, in the pane now headed **Sky at FM17ax** rather
than Sun, because the two are the same kind of thing: a countdown to an opening.
That renaming is the whole layout change — no fourth pane, which would have
given a quarter of the strip to a sentence that says "nothing for three hours"
most of the day.

**Peak elevation is always shown**, because it is what decides whether to
bother: twelve degrees is a scratchy two minutes and seventy is easy. Passes
peaking under **10°** are not reported at all; below that the line would say
something almost every hour and mean nothing.

Rejected: **anything on the map.** A footprint circle was the tempting one — it
would have reused the marker and night-region machinery already there, and it
looks good. But DESIGN.md has killed a layer for ink once already, and a
footprint answers "who else can hear it", which is a question for a contest, not
a glance.

**Reopened 2026-09-03: the line alone is not enough to point an antenna.** "In
46 min, peak 47°" says whether to bother and not which way to turn, and azimuth
is the half an operator actually needs. The countdown stays exactly as it is;
what was added is a page behind it. See "The pass list is a drill-down".

## The pass list is a drill-down, and that is not a new thesis · 2026-09-03

A standing **"Passes at FM17ax ›"** link under the countdown opens
`#/satellites`: the next twenty-four hours above 10°, and a **polar sky plot**
of whichever pass is selected — north up, horizon at the rim, zenith at the
centre, with rise, peak and set marked and their bearings given as both degrees
and compass points.

The link is deliberately **separate from the pass line and always present**. The
first version made the countdown itself the link, which failed twice over: it
was styled as the sentence it is, so nothing said it could be tapped, and on the
days it read "No pass above 10° today" there was no hint a list existed at all.
A door has to be in the same place whether or not there is anything through it.
The chevron carries the affordance; an underline would make a wall display look
like a web page.

This looks like a departure from "Gear in a corner. Nothing else." It is not.
`#/settings` and `#/about` have been hash-routed pages behind a tap since the
first slice; this is a third. The wall display is unchanged — the dashboard
still shows one line, and the page is only reached deliberately. What would have
broken the thesis is putting a pass table *in the strip*, which is why the list
is not there.

A **polar plot rather than a ground track**, which was the other candidate and
the one originally asked for. The plot maps onto the physical act: read a
bearing off the rim, read how high off the rings, and the shape says at a glance
whether this is a low northern skim or worth setting up for. A ground track
shows where the satellite flies and leaves the operator to infer where to point,
which is the wrong way round for the one job the page exists to do.

Bearings are given as **degrees and a 16-point compass name**, because both get
used: a rotator takes the number and a person holding an Arrow takes "WSW".
They are **true, not magnetic**, and the page says so — around FM17 the
declination is some 11° west, which is more than half a compass point and
exactly the sort of unstated assumption that has someone pointing at the wrong
patch of sky.

The list is **recomputed on every visit** rather than cached. The full search is
a few tens of milliseconds and the page is opened deliberately, so the simpler
thing is also the correct one: a cached list would quietly age past the passes
in it. Nothing on the page ticks — twenty-four hours of orbits do not change in
the minute someone spends reading them.

Rejected: **a second route for the detail.** List and plot share one page, so
picking a pass is a redraw and not a navigation. On a wall-mounted iPad being
prodded from a metre away, fewer states is worth more than deep-linking to a
pass that will have happened by the time anyone follows the link.



## SGP4 is vendored, and pinned to an old major · 2026-09-03

`vendor/satellite.js` is **satellite-js 5.0.0**, MIT, 23 kB, one UMD file.

The current release is 7.1.0 and it is modular ESM meant for a bundler — about
sixty files, no single-file build — which this project has no way to consume.
5.0.0 is the last version that ships `dist/satellite.min.js`. Pinning an old
major would normally be a smell; here it costs nothing, because SGP4 is a fixed
algorithm from the 2006 Vallado revision and everything 6.x and 7.x changed was
TypeScript, WebAssembly and packaging rather than orbital mechanics.

The file has **eight lines appended** and is otherwise untouched: the UMD
wrapper already assigns `globalThis.satellite`, so re-exporting that makes it a
valid ES module in the browser and under jsc alike. The addition is marked in
the file. Rejected: **writing SGP4 by hand**, which is fifteen hundred lines of
someone else's carefully validated arithmetic and the single worst place in this
project to introduce a subtle sign error.

Element sets come **direct from CelesTrak's amateur group** — 96 objects, 16 kB,
and it does send `access-control-allow-origin: *`. Worth recording how that was
got wrong twice: the header only appears when the request carries an `Origin`,
so a plain `curl -I` makes it look absent. The scheduled Action is still not
needed.

The last good file is kept in `localStorage`, not in the service worker, because
the worker precaches files rather than fetches and elements are the one thing
here that legitimately changes. Refetched twice a day. The line says how old its
elements are once they pass **a week**, which is where SGP4's along-track error
on a low orbit grows past a minute — and not before, because everything is
always hours old and saying so every minute is noise rather than honesty.

## The roster is nine birds, and it will go stale · 2026-09-03

`ROSTER` in `js/satellites.js`: ISS, SO-50, AO-7, RS-44, FO-29, AO-73, XW-3,
IO-117, AO-123. FM voice, linear transponders and one digipeater.

Matched on **NORAD catalog number, never on name.** CelesTrak's names carry
suffixes that change — RS-44 arrives as `RS-44 & BREEZE-KM R/B` — and the
number is the only stable handle.

Chosen over the alternatives on the same grounds as everything else here: the
amateur group's other eighty-seven entries are beacons and university cubesats
nobody works, and drawing them would be ninety-six countdowns to nothing.
Rejected: **the ISS alone**, which is the honest minimum but leaves the linear
birds — the interesting ones — invisible. Rejected: **all 96**. Rejected: **all
96 loaded with a curated default**, PLAN.md's own answer, which is right
eventually but is a settings UI, and the roster has to be proved useful first.

**This list is expected to rot** and that is accepted, not overlooked. Birds
fail; AMSAT's status page is the authority on what is alive, and this file is one
operator's shortlist meant to be edited. The parser reads all 96 regardless, so
widening it later is an edit to an array.

## Frequencies are bundled, not fetched · 2026-09-03

The pass page lists each satellite's transmitters — uplink, downlink, mode, and
whether a linear transponder inverts. Pointing an antenna and tuning a radio are
the two halves of working a satellite, and the page had only the first.

The data is **SatNOGS DB**, and it arrives as a committed file rather than a
fetch, for a reason that is the exact mirror of CelesTrak's: **SatNOGS sends no
CORS header.** Not on a GET and not on a preflight, checked with an `Origin` the
way a browser asks. CelesTrak does and SatNOGS does not, so this is the first
source the client genuinely cannot read for itself. Frequencies change on the
order of years, so `tools/build_transmitters.py` sits beside the Natural Earth
builders — run rarely, output committed. It reads `ROSTER` out of
`js/satellites.js` rather than repeating it, so the two cannot drift.

Notably this does **not** reopen the scheduled Action. A build step run by hand
every year or two is not a server.

**Filtering is the whole difficulty.** SatNOGS marks a great deal active: the
ISS lists fifty transmitters and reports forty-one active, being every payload
flown since 1998, and a page with forty-one lines on it is a database dump
rather than a reference. Entries carrying an **uplink sort first** — what you
can work, before what you can only hear — and each satellite is capped at five.
That yields thirty-one transmitters across nine satellites in under four
kilobytes.

Two known gaps, upstream and not ours: **XW-3's linear transponder and IO-117's
digipeater are not flagged active in SatNOGS**, so both show only telemetry. The
roster's most-worked digital bird is the one with the least useful entry. Fixing
it means editing SatNOGS, which is the right place to fix it.

## The first bundled thing with an obligation · 2026-09-03

SatNOGS DB is **CC BY-SA 4.0**. Everything else bundled here is either public
domain (Natural Earth, which asks nothing and is credited anyway) or MIT (the
two vendored libraries). This is the first that imposes conditions.

`data/transmitters.json` is therefore **licensed separately from the code**, and
`LICENSE` says so at length. Share-alike attaches to the data and its
adaptations, not to the software that reads it — `js/satellites.js` and
`js/render.js` stay MIT. That the licence file was already split into "the
software" and "bundled third-party material" made this a paragraph rather than
a problem, which is the argument for having structured it that way before
anything needed it.

Attribution is on the About page and in the file's own `source` and `license`
fields, so a copy that escapes the repository still says where it came from.

## Bz is the one number that looks forward · 2026-09-03

The space weather pane gained two readings, and neither cost much.

**The A index was already being fetched and thrown away.** `readKp` has always
pulled `a_running` out of the Kp payload and nothing rendered it. Kp is the
three-hour index and A is the day; conditions are quoted as the pair — "SFI 118,
A 8, K 2" — and one without the other is half the picture. It joins the Kp
tile's trend caption at no network cost whatever.

**Bz and solar wind speed are 119 bytes**, across two summary endpoints smaller
together than the flux one. Bz earns a tile of its own because it is the only
thing on the display that **leads** rather than reports: Kp says what the last
three hours did, while southward Bz is what couples solar wind energy into the
magnetosphere in the first place, so it moves first and Kp follows an hour or
two behind. For an operator watching a path about to go, that is the difference
between a warning and a post-mortem.

The **sign is the meaning, and the tile shows it explicitly** — `+4` and `-4`
are opposite news, and a northward field shuts the coupling off however strong
it is. So `bzBand` is not a magnitude test; a magnitude test would paint a
strongly northward field as a storm, in the one colour a reader takes at face
value from across the room. Its boundaries, −3 and −8, are a **stated
convention** exactly as the grey line's are: coupling scales smoothly and
depends on how long the field holds, so the physics supplies no threshold.

Wind speed goes in the tile's caption rather than a tile of its own. It is
context for Bz, not a reading anyone acts on alone.

Rejected: **`noaa-scales.json`** (1.1 kB), the R/S/G scales in plain language.
Readable, but it mostly restates the Kp and X-ray numbers already on screen.

Rejected: **the aurora oval**, `json/ovation_aurora_latest.json`. It is a real
map layer and genuinely useful for VHF, and it is **920 kB every five minutes**.
That is a hundred times the rest of the display's traffic put together, and
unlike every other map layer it cannot be precached — it would be the first
thing on the map that vanishes offline. Reopen deliberately or not at all.

Rejected on size: **`alerts.json`** (40 kB of prose), **proton flux** (230 kB
for what the S-scale gives in one), and the **solar cycle indices** (512 kB of
monthly figures back to 1749, which are history rather than conditions).
Current sunspot number turns out to have no small endpoint at all —
`products/summary/solar-regions.json` returns 404.

## Four tiles, two by two · 2026-09-03

The space weather tiles were a flex row and a fourth would have left each about
seventy points wide. The captions are what breaks first: "Kp, down from 5 · A 8"
needs three lines at that width, and it is the caption carrying DESIGN.md's own
rule that a trend is information where a bare number is trivia.

Two columns give every tile half the pane — **more room than the three-across
layout had** — so the trend reads on one line for the first time. The cost is
pane height, which the strip has: this puts the space weather pane at roughly
224 points against the 269 available at 1080x810, making it marginally the
tallest, just past the Sky pane.

## The band grid is the fourth pane · 2026-09-03

Eight bands as a 4x2 block of colour in its own pane: green good, amber fair,
red poor, no colour at all for closed, and a dashed outline for a band that
cannot be rated because there is no flux reading. The whole block is one link to
the page.

The point is that **nobody reads "good" and "poor" at three metres** — they read
the pattern. A wall of colour answers "is it worth turning the radio on" in the
time it takes to look up, which the sentence it replaced ("Bands: 15 m best now
(derived)") did not. Anyone close enough to want the reasoning is close enough
to tap.

The number alone labels each cell; "80 m" does not fit four across a 270-point
pane and the metres were never in doubt. The **wash is mixed into the panel
rather than filled**, because eight saturated blocks is a traffic-light array
and the number stops being readable on it in either theme.

**Where the room came from.** Not from the map, and not from the clock. The
first proposal was to drop UTC to the size of the other times and fold sunrise
and sunset in beneath it — rejected for the reason "One idiom for every number
in the strip" already gives: UTC is the operating clock, logs and nets and spots
are all in it, and it is the one number that should be findable without reading.
Shrinking it makes sunset its peer.

The width came instead from **the Time pane, which held two numbers in a third
of the strip and did not need to.** Four panes at 270 points each cost nothing
there. The pane that did feel it was Space weather, whose tile captions were
already the tightest thing in the strip — so the **A index and the wind speed
moved out of the tile captions into the group caption**, where they are better
placed anyway: both are context for the readings above them rather than
readings, and they now sit together.

Rejected: **a second row in the strip**, which would have needed the map to give
up sixty points of height and stop being full width.

## Band conditions are an inference, and say so · 2026-09-03

A `#/bands` page rates the eight HF bands from **three numbers already on the
display**: solar flux, the K index, and the sun's altitude at the operator's own
grid. No new network, no permission, no server. The dashboard carries the
headline as a standing link — "Bands: 15 m best now (derived)".

**The word "derived" is on the dashboard and not only on the page.** The
dashboard is what most people will ever read, and a band call with no qualifier
looks like a measurement.

This is not VOACAP and does not pretend to be, which is worth stating because
VOACAP is the obvious thing to reach for. Rejected: **VOACAP itself.** There is
no browser port — nothing on cdnjs, nothing on npm, no WASM build — voacap.com's
`/api/` returns 403, and pointing every wall display at a volunteer-run site
would be poor form. More to the point it answers a different question: VOACAP
gives a monthly median for a stated path, antenna and power, which is a planning
answer you get sitting down. The page links to it for exactly that.

Rejected for now: **prop.kc2g.com**, which is measured foF2 and MUF from the
GIRO ionosonde network and genuinely better than any inference. Two obstacles,
both checked: it sends **no CORS header**, so it would need the scheduled Action
this project has so far never required, and the licensing question is already
open. The page links to it too.

**What the model is, precisely.** Flux sets a ceiling per band, using the old
operator's rule of thumb — 70 gets 20 m, 90 opens 17 and 15, 120 brings 12 in,
140 makes 10 reliable. The sun's angle decides which end of the spectrum is
awake, since the D layer absorbs the low bands by day and decays at night. The K
index only ever subtracts, because a geomagnetic storm has never improved an HF
path. Every threshold is a **stated convention**, as the grey line's and Bz's
are.

**Both continuous terms are slopes, not steps**, and both had to be corrected to
become so. Absorption and F2 ionisation each scale roughly with the cosine of
the solar zenith angle, so the sun enters as `sin(altitude)` rather than as a
day/night flag; the flux term is graded by how far short of its rule of thumb a
band is. `daylight()` survives as a label for the header line only.

**Four things the checks and one screenshot caught, all of them the model
overstating itself:**

- Daylight was rescuing a flux-starved band, calling 10 m "poor" at flux 65 on
  the strength of it being noon. Sunshine does not create F2 ionisation the flux
  says is absent.
- The flux test was a cliff. 12 m flipped between closed and fair across a
  single point of flux, which is not a shape the ionosphere has.
- With **no flux reading at all** the daylight bonus stood unopposed and the
  table announced that 10 m was good. A band whose fate depends on a number
  nobody has is `unknown`, which is deliberately not one of the four ranked
  states — an unrateable band is not a worse band than a closed one.
- **The sun was still a step after the flux had stopped being one.** A sun at
  14° and one at 60° both read "day", so 80 m took the full noon absorption
  penalty an hour after sunrise. Caught on the wall, not in a check, which is
  the argument for looking at the thing: the same cliff had already been fixed
  twice in the same file and was missed a third time.

The flux figure is **not repeated on every row** — it is in the header line
above them, and printing it eight times was close to a third of the text on the
page.

An earlier scoring also put almost every band on "good" or "closed" and never
used the two words in between, which made the table less informative than the
flux figure it came from. Neutral now reads "fair", which is what 80 m at the
grey line should say.

## Bands stay out of settings after all · 2026-09-03

"A gear icon" recorded that bands would return to settings "when there is
something band-specific to show". There now is, and they are still not returning.

The cut was made because a setting that changes nothing teaches the reader the
settings page is decorative. The condition has been met but the **need** has
not: the page shows all eight bands, and eight rows on a page opened
deliberately cost nothing. A band selector would be a setting whose only power
is to *hide* information — which is a worse thing for a settings page to teach
than being decorative.

It returns if the band call ever moves somewhere space is scarce, which means
the strip. It has not.

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

## One idiom for every number in the strip · 2026-09-02

Every value in the strip is a number with a small uppercase caption under it.
The Sun pane used to be a `<dl>` of label-left, value-right rows, so four times
were shown at four sizes in two different shapes — the Time pane read as big
numbers with captions and the Sun pane read as a table. Both now stack, which is
what the space weather tiles were already doing.

Hierarchy is what the strip is doing with size, and it survives intact: **UTC is
the only `.big` number on the display.** Local, sunrise and sunset share `.mid`.
One large number, and it is the operating clock — logs, nets and spots are all
UTC, so it is the number looked at most and the one that should be findable
without reading.

Rejected: **folding the Time and Sun panes into a single times pane.** The pull
is obvious, since all four values are HH:MM, and a 2×2 grid of monospace times
is a good shape at distance. But it makes all four peers, which promotes sunset
to the rank of UTC. It also has nowhere to put "Sun at FM17" — that heading is
carrying the fact that two of the four times are grid-derived where UTC is
universal and local is whatever zone the iPad believes it is in, and replacing
it with per-row qualifiers is more ink than it saves. The grey-line countdown,
the most useful line in the strip, would be orphaned under the grid. And two
panes at `1fr 1fr` hands half the strip to three small tiles.

The cost is about 50 points of extra height in the Sun pane, which the 270-point
strip absorbs.

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

Roughly in the order they should be taken.

- **A ground track or footprint on the map.** Turned down twice on ink, and the
  polar plot has since answered the pointing question that was the real reason
  to want it. Reopen only if something needs *where it is* rather than *where to
  point*.
- **Choosing satellites in settings.** The roster is nine birds in a source
  file. Making it editable is PLAN.md's "all 96 loaded, a curated default",
  which was right eventually and is a settings UI; wait until the line has
  proved itself on the wall.
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

**Closed rather than pending**, so they are not picked back up: PLAN.md's
**widget sizes** and **notification policy** both died with the phone-widget
thesis, and its question about **openhamclock's browser build** is answered — it
is real, hosted and live. **Offline caching** shipped 2026-09-02; see "Offline
is a precached generation". **Satellites** shipped 2026-09-03 as one line of
text plus a pass page; see "Satellites are a countdown, not a panel" and "The
pass list is a drill-down". The **README** shipped 2026-09-03, and the LICENSE
gained the two bundled things it had been missing: satellite-js, and the
borders and lakes files that arrived a day after the coastline. **Band
conditions** shipped 2026-09-03 as a derived readout, which also closed the
question of bands returning to settings — they are not.

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
