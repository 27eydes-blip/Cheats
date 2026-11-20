// Service worker: installable app, offline page, and saved Morning Editions.
// Network-first for pages; falls back to a saved edition or the offline page.
const CACHE = "ts-v3";
const EDITIONS = "ts-editions";
const OFFLINE = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/icon.svg"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== EDITIONS).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(async () => (await caches.match(e.request, { cacheName: EDITIONS, ignoreSearch: true })) || caches.match(OFFLINE)),
    );
  }
});
