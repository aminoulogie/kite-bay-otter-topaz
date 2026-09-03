/**
 * Service worker template.
 *
 * Lives as a real file rather than a string inside the deploy workflow: JS at
 * column zero inside a YAML block scalar silently breaks the workflow, which
 * is exactly how this shipped broken once. The staging step substitutes the
 * placeholders below with the build's content-hashed asset names.
 */
const CACHE = "__CACHE__";
const PRECACHE = __PRECACHE__;
const BASE = "__BASE__";

// Take over immediately. The update ritual here is force-quit and reopen;
// waiting for every old client to close would make that not work.
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Food lookups are never cached: a stale product is worse than the honest
  // "offline" the UI already handles.
  if (url.hostname.endsWith("openfoodfacts.org")) return;

  // Cross-origin (fonts) is left to the browser.
  if (url.origin !== self.location.origin) return;

  // Navigations resolve to the cached shell. This is what makes the app open
  // at all with no network.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() =>
        caches.match(BASE + "/index.html").then((r) => r || caches.match(BASE + "/")),
      ),
    );
    return;
  }

  // Hashed assets are immutable, so cache-first is safe: a new build simply
  // requests a new filename.
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    }),
  );
});
