# bandwatch — a small ham radio dashboard for iPhone

Grayline, sun times, space weather, and the next satellite pass. A widget you
glance at, and an app you open when the widget makes you curious.

Native SwiftUI, iPhone first. Two data sources, both institutional, both slow-
moving. Everything else computed on the device.

**Status: SHELVED 2026-08-17, before any code was written.**

Not abandoned for lack of interest — abandoned because the problem it set out to
solve turned out to be already solved. `openhamclock.com` is a live, free, hosted
web dashboard with 30+ panels and satellite tracking, and it removed the setup
barrier that was this project's entire reason to exist. See "What OpenHamClock
already is" below.

Kept as a record because the research in it is reusable: the wspr.live schema and
terms, the captured DX cluster session in `spec/`, HamClock's real feature set,
and the reasoning about maintenance surface for a one-person project.

**The process lesson, recorded because it cost a day:** the competitive check was
done last. It should have been first. A plan written before knowing what already
exists is a plan that argues itself into a position the facts do not support.

`bandwatch` is a working name. It reads narrower than the app now is — band
conditions are no longer the centre — so it is worth revisiting before anything
ships. It appears in the repo name, bundle ID, and display name, nowhere
structural.

## The governing constraint

**One person maintains this, indefinitely, in spare time.** Every decision below
follows from that. A feature that breaks when somebody else's service changes is
a feature that will eventually be broken for months, because the person who
would fix it is doing something else that weekend.

HamClock is the cautionary tale, not the template. It was ambitious, excellent,
and it went dark the moment one person stopped — taking thousands of working
installs with it. The lesson is not "build it more openly." It is "build
something small enough that neglect is survivable."

So the test for any feature is not *is this useful* — most of them are. It is
**what happens to this feature if nobody touches the repo for a year?**

## What OpenHamClock already is — checked 2026-08-17

Read this before anything below it. It invalidates premises the rest of the plan
was built on, and the rest of the plan has not yet been reworked around it.

`openhamclock.com` is a **live, hosted, free web dashboard** — React and Node,
MIT licensed, maintained by Chris Hetherington (K0CJH). Not a build badge, not a
plan. It is running now, and the original HamClock is stated to cease functioning
in June 2026, so this is already the successor in practice.

What it has:

- **30+ panels**: world map, DX cluster, space weather, POTA/SOTA activators,
  rig control, digital mode decodes.
- **Satellite tracking**: real-time SGP4 for 40+ amateur satellites, with pass
  windows, Doppler, range, and footprint.
- **Zero installation** on the hosted version. Self-host on Pi/Windows/macOS/
  Linux or Docker if you want to.
- Explicitly intended for "a tablet on the operating table, a second monitor, a
  phone, or even a wall-mounted display."

Three premises this plan rested on are now gone:

1. **Zero-install is not a differentiator.** It was the strongest one. A hosted
   URL beats an App Store download, and they have it.
2. **Satellites are covered**, more thoroughly than planned here — 40+ birds with
   Doppler and footprint against this plan's LEO-only pass list. That was the
   feature chosen to earn a permanent home-screen slot.
3. **Phones are addressed.** Not natively, but the responsive web app is
   explicitly meant to work on one.

What honestly survives as native-only ground:

- **Notifications.** A web page cannot reliably wake an iPhone for a satellite
  pass. This is real, and it is now the strongest remaining argument.
- **Home-screen widgets.** No web app gets one on iOS. Also real.
- **Works with no signal.** Passes computed on-device from stored TLEs need no
  connection; a hosted dashboard needs one.
- **Deliberate smallness.** 30+ panels is a different product from five things
  and a widget. Whether that difference is worth an app is a judgement call, not
  a technical fact.

That is a narrower and more modest niche than this plan assumed when it was
written. It is not nothing — widget plus notifications plus offline is a genuine
gap — but the scope below should be re-read with the understanding that its
competitive framing is now optimistic.

## Relationship to HamClock

HamClock (Elwood Downey, WB0OEW, SK January 2026) was the shack-display standard
and the original inspiration. Its backend went offline when he did.
`openhamclock`, `hamclock.com` and `ggilman/hamclock` are actively continuing
it, and `clearskyinstitute.com` now refuses connections outright.

This is not a port, a fork, or a competitor:

- **Different platform, deliberately.** openhamclock's client is X11/C++ and
  appears to be pursuing a browser build. iOS is somewhere that codebase cannot
  realistically go, so there is no risk of two efforts converging on the same
  thing. The web lane is theirs; this one is empty.
- **Different size.** HamClock is a complete instrument panel. This is five
  things done well.
- **Different moment.** HamClock is looked at while operating. This is looked at
  from the sofa, deciding whether to go operate at all.
- **No load on community infrastructure.** This never touches `hamclock.com` or
  any community backend. Both sources here are institutional.

Credit the original and link all three continuations on the About screen,
prominently. Someone who wants the real HamClock should find it from here in one
tap — this app is not a substitute for it and should not pretend to be.

## Scope

### The whole app

1. **Grid and clock.** UTC, local, and the operator's Maidenhead grid. Typed
   once, remembered.
2. **Grayline, scrubbable.** World map with the day/night terminator, and a time
   slider that sweeps it. The one interaction a wall display cannot do.
3. **Sun times.** Sunrise, sunset, civil and nautical twilight. Grayline windows
   stated in words, because "your grayline to Japan opens at 04:41 for eighteen
   minutes" is the actionable part and the map is only how you see why.
4. **Space weather, in plain language.** Solar flux, K, A, from NOAA SWPC. With
   a trend, because "K 2, down from 5 overnight" is information and "K 2" is
   trivia.
5. **Next satellite pass, with a notification.** The feature that earns a
   permanent home-screen slot.

And over the top of all of it, **the widget** — which is the actual product.

### The widget is the product

Home screen shows current conditions and the next pass. That is the fifteen-
second job done without opening anything. The app is the drill-down for when the
widget makes someone curious.

This inverts the original spec, which treated a widget as a bonus. It is the
centre: maximally phone-native, structurally impossible on a kiosk display, and
small enough to keep alive forever.

### Deliberately not built

Each of these was considered and rejected on the maintenance test above, not
overlooked:

- **DX cluster / telnet / skimmer spots.** Needs a live socket connection a
  scheduled job has to babysit, plus cluster etiquette risk against Mike's own
  callsign, plus a callsign-to-location resolver that HamClock itself declined
  to build. Highest breakage surface in the entire earlier draft.
- **WSPR aggregation via wspr.live.** Genuinely good data and a genuinely nice
  idea, but it carries a coverage-bias problem that has to be solved correctly
  or the app lies, a licensing obligation to keep results public, and a
  dependency on one volunteer's database. Retired with the cluster work.
- **VOACAP / propagation prediction.** A monthly-median model presented beside
  measurements invites people to read it as a nowcast. HamClock does this well
  already.
- **Logging, rig control, contest calendar, QSL/LoTW, repeaters, APRS,
  terrestrial weather.** All either solved better elsewhere or requiring
  accounts and servers this deliberately has none of.
- **A web version.** Ceded to openhamclock.

If any of these come back, they come back *after* the small version has shipped
and survived a year — not before.

## Decisions

### Location is a grid square. Never an address.

**The app asks for a Maidenhead grid and nothing else.** No address, no
postcode, no city lookup, no geocoding field. Hard constraint.

It is also the right engineering call, which is the useful part — the privacy
answer and the correct answer coincide:

- Every ham knows their grid. It is printed on QSL cards and published openly on
  QRZ. Asking for it requests something operators volunteer routinely; an
  address is categorically different.
- **No permission prompt.** Typing `FM17` needs no location consent and no
  first-run dialog. For a product built on removing friction, the permission
  prompt *is* friction.

**Accept 4, 6, or 8 characters, prefer 6.** The extra pair matters more than it
looks: `FM17` is about 176 km east-west at that latitude, spreading sunrise
across roughly eleven minutes — real error for grayline work, which is played in
minutes. `FM17ax` narrows that to about 7 km and well under a minute. Take 4 if
that is all someone knows, use the square's centre, but ask for 6 and say why.

Six characters is still ~7 × 5 km. A town, not a house — the privacy property
survives the precision gain.

CoreLocation stays available as a one-tap convenience for portable and POTA
work, with one rule: **truncate to a grid immediately and persist only the
grid.** Raw coordinates are never stored and never leave the device.

### Privacy: there is nothing to leak

- No accounts, no sign-in, no email, no per-user record anywhere.
- No analytics, no crash-reporting SDK, no third-party frameworks.
- The only outbound requests are to a static GitHub Pages URL for data files,
  identical for every user, carrying nothing about who is asking.
- Preferences stay on device.

Say this plainly on the About screen. "Your location never leaves your phone,
because there is nowhere for it to go" is true, and it is a real differentiator
against every ham app that wants a login.

### The static data layer is insulation, not infrastructure

The app does **not** parse NOAA or Celestrak directly. A scheduled GitHub Action
fetches both, normalizes with `python3` standard library, and commits static
JSON served from GitHub Pages. The app reads only those files.

This looks like unnecessary machinery for two sources. It is the single most
important maintenance decision in the plan:

- When a source changes its format — and NOAA will — the fix is a commit to a
  Python script. Every installed copy recovers within the hour. If the app
  parsed feeds directly, the same change would require an emergency App Store
  submission and a review wait, with every user broken meanwhile.
- Celestrak explicitly asks not to be hammered by many individual clients. One
  scheduled fetch serving every install is the polite architecture as well as
  the robust one.
- A failed fetch leaves yesterday's file in place, so the app degrades to
  *stale* rather than *blank*. `verify.py` refuses to publish garbage, the same
  role it plays in `radio-stations`.

Same machinery as `radio-stations`, which has been running this way on a weekly
cron without attention. Reuse the shape.

### Refresh model

Divergence from `radio-stations`' manual "Update now" button, deliberately: a
widget cannot ask permission to refresh.

- **TLEs**: fetched when the app is foregrounded and the local copy is over a
  day old. SGP4 accuracy degrades slowly enough that a few days stale is fine.
- **Passes and notifications**: computed entirely on device from the stored
  TLEs, so alerts work with no network at all.
- **Space weather**: WidgetKit timeline refresh on iOS's budget, plus a fetch on
  app foreground.
- **Staleness is always visible.** Every panel says how old its data is. That is
  the trust mechanism that makes "stale rather than blank" honest.

### Satellites: near-Earth SGP4 only

Every amateur LEO satellite worth predicting has a period under 225 minutes,
which is exactly the SGP4/SDP4 boundary. Implementing near-Earth SGP4 and
refusing to propagate anything past that cutoff avoids the deep-space terms,
which are most of the complexity and nearly all of the subtle bugs.

Write it rather than take a dependency. It is a bounded, well-specified,
testable piece of math with a published reference implementation to check
against — the kind of thing a dependency costs more to carry than to own.

### Sun math is a port, not new work

`AltAzCalculator.swift` in `astrotonight-ios` already does sun position and
twilight, and is already fixture-validated. The subsolar point and terminator
are the same math pointed at a different question. Port it, and carry a `spec/`
fixture across so the two stay honest — same arrangement `astrotonight-web` uses.

### Map: draw it, don't import it

Equirectangular projection, Natural Earth coastlines (public domain), simplified
and bundled. No MapKit, no tiles, no map library. An equirectangular grayline map
is one projection function and a coastline path; a mapping framework adds weight
and per-user network requests to buy nothing. Tiles would also mean every user
hitting somebody's tile server, which the privacy claim rules out.

## Data

Two sources. Both free, both keyless, both institutional, neither likely to
vanish.

| File | Source | Refresh |
|---|---|---|
| `spacewx.json` | NOAA SWPC public JSON (`services.swpc.noaa.gov`) | ~30 min |
| `tle.json` | Celestrak, amateur satellite element sets | daily |
| `meta.json` | generated timestamps, for staleness display | every run |

## Structure

```
bandwatch/
  BandWatch.xcodeproj
  BandWatch/
    Models/
    Services/
      Grid.swift              Maidenhead <-> lat/lon, 4/6/8 char
      SolarCalculator.swift   ported from astrotonight-ios
      Terminator.swift        subsolar point -> terminator polyline
      SGP4.swift              near-Earth only
      Passes.swift            pass search, AOS/LOS/max elevation
      DataClient.swift        fetch static JSON, staleness, caching
    Views/
      DashboardView.swift
      GraylineView.swift      map + time slider
      SpaceWeatherView.swift
      PassesView.swift
      SettingsView.swift      grid entry, units, notifications
      AboutView.swift         credit, sources, privacy
    Widget/
      BandWatchWidget.swift
    Resources/
      coastlines.json         Natural Earth, simplified, public domain
  BandWatchTests/
  Tools/
    fetch_spacewx.py          python3 stdlib
    fetch_tle.py              python3 stdlib
    verify.py                 exit 1 if unfit to publish
  docs/data/                  published by Pages, written by the workflow
  spec/
    sun_fixture.json          carried from astrotonight-ios
  .github/workflows/
    refresh.yml               cron + workflow_dispatch
```

## Open questions

- [ ] **Confirm openhamclock's browser build is real** before finalising the
      decision to cede web. It is a README badge, not a shipped product, and the
      whole platform choice rests on it.
- [ ] Which satellites ship in the default list? The full amateur set is long and
      mostly uninteresting; ISS, the SO-50/AO-91/AO-92 class, and the current
      linear transponders is probably the honest default, with the rest opt-in.
- [ ] Widget sizes and what each shows. Small is one number and a pass time;
      medium can carry the grayline strip. Design before building.
- [ ] Name.
- [ ] Notification policy — how far ahead, and how to avoid being the app that
      wakes someone at 3am for a marginal pass. Elevation threshold, quiet hours,
      or both.

## First slice

Grid entry, clock, sun times, and the scrubbable terminator map. No network, no
pipeline, nothing blocked by any question above, and largely a port of math that
already exists and is already validated. It also proves the time slider, which
everything else hangs off.

Then the widget, then satellites.
