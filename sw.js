// Offline shell for the wall display.
//
// A page already on screen survives losing the network -- sun times and the
// terminator are local maths, and space weather is stale-by-design. A *reload*
// did not: `data/coastline.json` would not arrive and the map was replaced by
// "Coastline unavailable". On something meant to run unattended for months in a
// shack, an overnight router reboot plus one reload should not cost the map.
//
// It also fixes a second thing. GitHub Pages serves assets with a 600-second
// cache, so a deploy can hand a browser a fresh `index.html` against a stale
// `main.js`. Precaching every asset together, in one generation, means the app
// on screen is always one self-consistent set of files.
//
// Deliberately a classic worker script with no imports: `type: 'module'` for
// service workers only arrived in Safari 16.4, and this is meant to run on
// whatever iPad was spare.

// Bumped by spec/check_sw.mjs, which digests the files below and fails when
// this does not match. Nothing to remember: run the checks and paste what it
// prints. See DESIGN.md, "Offline is a precached generation".
const BUILD = '06d27ebd';
const CACHE = `worldpane-${BUILD}`;

// Everything the app needs to start with no network. The check verifies each
// path exists and that nothing index.html or the modules reference is missing,
// because one bad path rejects addAll and silently precaches nothing at all.
const ASSETS = [
  "index.html",
  "css/style.css",
  "js/main.js",
  "js/grid.js",
  "js/sun.js",
  "js/terminator.js",
  "js/map.js",
  "js/graticule.js",
  "js/globe.js",
  "js/spacewx.js",
  "js/settings.js",
  "js/theme.js",
  "js/symbols.js",
  "js/satellites.js",
  "js/skyplot.js",
  "js/render.js",
  "vendor/astronomy.js",
  "vendor/satellite.js",
  "data/coastline.json",
  "data/borders.json",
  "data/lakes.json"
];

// What a navigation to any URL in scope resolves to. The app is hash-routed, so
// `#/settings` and `#/about` are this same file.
const INDEX = 'index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // `cache: 'reload'` is the half that beats the 600-second asset cache:
      // without it the install could refill a new generation out of the same
      // stale HTTP cache the generation exists to escape. A browser that
      // ignores the hint degrades to today's behaviour rather than failing.
      .then((cache) => cache.addAll(ASSETS.map((path) => new Request(path, { cache: 'reload' }))))
      // Take over at once. Nothing on screen refetches anything -- the layers
      // are loaded once at start -- so there is no page to disturb, and a wall
      // display should not need a second reload to pick up a fix.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // NOAA is left alone on purpose. Space weather is the one thing here that is
  // *supposed* to fail when the network is down: spacewx.js keeps the last
  // reading and render.js says how old it is, which is DESIGN.md's "staleness
  // is always visible". Serving it from a cache would turn an honest stale
  // number into an invisible one.
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(caches.match(INDEX).then((hit) => hit || fetch(request)));
    return;
  }

  // Cache first, and no revalidation. The whole point of a generation is that
  // it is consistent; assets are only replaced by an install, never one at a
  // time. Anything not precached -- there is nothing today -- falls through to
  // the network and is not cached, so this never grows behind your back.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request))
  );
});
