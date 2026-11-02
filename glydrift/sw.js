// Glydrift offline support: network-first so updates arrive, cached copies when there's
// no signal. Only same-origin GETs are handled — leaderboard (Supabase) calls pass through.
const CACHE = "glydrift-mvzvp4ds";
const CORE = ["./", "manifest.json", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) =>
        Promise.all(
          ks.filter((k) => k.startsWith("glydrift-") && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  // the page itself always bypasses the HTTP cache, so a new version shows up on next launch
  const net =
    r.mode === "navigate"
      ? fetch(r.url, { cache: "no-store", credentials: "same-origin" })
      : fetch(r);
  e.respondWith(
    net
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(r, copy));
        }
        return res;
      })
      .catch(() => caches.match(r).then((hit) => hit || caches.match("./"))),
  );
});
