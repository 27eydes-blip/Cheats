// Service worker: installable app, offline page, saved Morning Editions, and push alerts.
// Network-first for pages; falls back to a saved edition or the offline page.
const CACHE = "ts-v4";
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

// Push alerts. The server sends { title, body, url, tag }; the same tag replaces an older alert instead of stacking.
self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: "WorldNet News", body: e.data ? e.data.text() : "" };
  }
  const url = typeof d.url === "string" && d.url.startsWith("/") ? d.url : "/";
  e.waitUntil(
    self.registration.showNotification(d.title || "WorldNet News", {
      body: d.body || "",
      tag: d.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) return c.navigate(url).then((w) => (w || c).focus());
      }
      return self.clients.openWindow(url);
    }),
  );
});

// The browser rotated the subscription: tell the server about the new one.
self.addEventListener("pushsubscriptionchange", (e) => {
  const old = e.oldSubscription;
  const key = old && old.options && old.options.applicationServerKey;
  if (!key) return;
  e.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).then((sub) =>
      fetch("/api/push/subscription", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), replaces: old.endpoint }), credentials: "include" }),
    ),
  );
});
