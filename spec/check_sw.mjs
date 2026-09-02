// Checks for sw.js, the offline precache.
//
// A service worker cannot be exercised under the JavaScriptCore shell -- there
// is no `caches`, no `fetch`, no `self`. What *can* be checked is the thing
// that actually goes wrong: the asset list drifting away from the app. One bad
// path rejects `cache.addAll`, the install fails, and nothing is precached --
// silently, because the page carries on working perfectly until the network
// goes away. So this reads sw.js as text and checks the list against the disk.
//
// It also carries the version bump. `BUILD` is a digest of the precached files,
// so shipping changed assets under an unchanged cache name is a failure here
// rather than an iPad on a wall that never updates again. Nothing to remember:
// run this and paste the line it prints.
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
//     -m spec/check_sw.mjs
//
// Run from the repository root; `read` resolves against the working directory.

let failures = 0;
function check(name, got, want) {
  const ok = typeof want === 'boolean' ? got === want
                                       : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    print(`FAIL ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
}

const source = read('sw.js');

// --- it at least parses ------------------------------------------------------
// The worker cannot be run here, but it can be compiled: `new Function` parses
// the whole body without executing a line of it. Worth the three lines, because
// a syntax error in sw.js fails registration quietly -- the page carries on and
// the only symptom is that offline never starts working.
try {
  new Function(source); // eslint-disable-line no-new-func
} catch (err) {
  failures++;
  print(`FAIL sw.js does not parse: ${err.message}`);
}

// --- pull the constants back out of the worker -------------------------------
// sw.js is a classic worker script and cannot be imported, so the three things
// worth checking are lifted by pattern. ASSETS is written as JSON on purpose so
// this stays a parse rather than an evaluation.
function constant(name, pattern) {
  const m = source.match(pattern);
  if (!m) {
    failures++;
    print(`FAIL sw.js has no readable ${name}`);
    return null;
  }
  return m[1];
}

const build = constant('BUILD', /^const BUILD = '([0-9a-f]{8})';$/m);
const indexPath = constant('INDEX', /^const INDEX = '([^']+)';$/m);
const assetsSource = constant('ASSETS', /^const ASSETS = (\[[\s\S]*?\]);$/m);
const assets = assetsSource ? JSON.parse(assetsSource) : [];

// --- the list is sane --------------------------------------------------------
check('ASSETS has no duplicates', assets.length, new Set(assets).size);
check('ASSETS holds only relative paths', assets.every((a) => /^[\w][\w./-]*$/.test(a)), true);
// Caching the worker itself would pin the version that decides the version. The
// browser refetches sw.js on navigation without our help; that is the escape
// hatch and it must stay open.
check('sw.js does not precache itself', assets.includes('sw.js'), false);
check('INDEX is precached', assets.includes(indexPath), true);

// --- every precached path exists ---------------------------------------------
const contents = new Map();
for (const path of assets) {
  try {
    contents.set(path, read(path));
  } catch {
    failures++;
    print(`FAIL precached asset does not exist: ${path}`);
  }
}

// --- nothing the app loads is missing from the list --------------------------
// The list is hand-written, which is the price of having no build step. This is
// what makes hand-written safe: adding a module or a data file and forgetting
// the worker is caught here rather than on a reload with no wifi.

/** Resolve `spec` against the directory of `from`, as the browser would. */
function resolve(from, spec) {
  const base = from.includes('/') ? from.slice(0, from.lastIndexOf('/')).split('/') : [];
  const out = spec.startsWith('/') ? [] : base.slice();
  for (const part of spec.replace(/^\//, '').split('/')) {
    if (part === '.' || part === '') continue;
    else if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

const isLocal = (u) => !/^(?:[a-z]+:|\/\/|#|data:)/i.test(u);

const referenced = new Set();
// index.html: stylesheets and the module entry point.
for (const m of read(indexPath).matchAll(/(?:href|src)="([^"]+)"/g)) {
  if (isLocal(m[1])) referenced.add(resolve(indexPath, m[1]));
}
// Every precached module: its imports, and the layer files it fetches by name.
for (const path of assets) {
  if (!path.endsWith('.js')) continue;
  const text = contents.get(path) || '';
  for (const m of text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
    if (isLocal(m[1])) referenced.add(resolve(path, m[1]));
  }
  for (const m of text.matchAll(/['"](data\/[\w./-]+)['"]/g)) referenced.add(m[1]);
}
// The worker is referenced by the registration in index.html and must not be
// precached, so it is the one reference that is expected to be absent.
referenced.delete('sw.js');

for (const path of [...referenced].sort()) {
  if (!assets.includes(path)) {
    failures++;
    print(`FAIL the app loads ${path}, which sw.js does not precache`);
  }
}
check('index.html registers the worker',
  /navigator\.serviceWorker\.register\(/.test(read(indexPath)), true);

// --- the cache name tracks the contents --------------------------------------
// FNV-1a over each path and its bytes, in list order, so a changed file, a
// renamed one, a new one and a dropped one all move the digest. Not a security
// hash -- it only has to notice an edit, and it has to give the same answer on
// this machine every time.
function digest(paths) {
  let h = 0x811c9dc5;
  for (const path of paths) {
    for (const s of [path, ' ', contents.get(path) || '']) {
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        h = Math.imul(h ^ (c & 0xff), 0x01000193);
        h = Math.imul(h ^ ((c >> 8) & 0xff), 0x01000193);
      }
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const want = contents.size === assets.length ? digest(assets) : null;
if (want && want !== build) {
  failures++;
  print('FAIL sw.js precaches changed assets under an unchanged cache name.');
  print(`     Paste this into sw.js:  const BUILD = '${want}';`);
}

if (failures) {
  print(`\n${failures} check(s) failed.`);
  throw new Error('service worker checks failed');
}
print(`sw.js: all checks passed (${assets.length} assets, BUILD ${build}).`);
