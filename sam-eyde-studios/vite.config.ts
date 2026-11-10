import { createHash } from "node:crypto";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Emits a tiny service worker that precaches the built app so the studio
 * keeps working offline once it has been opened (or installed) one time.
 */
function offlineServiceWorker(): Plugin {
  return {
    name: "ses-offline-sw",
    apply: "build",
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith(".map"));
      const assets = ["./", "index.html", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png", ...files];
      const version = createHash("sha1").update(assets.join("|")).digest("hex").slice(0, 10);
      const source = `const CACHE = "ses-${version}";
const ASSETS = ${JSON.stringify([...new Set(assets)])};
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)),
  );
});
`;
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), offlineServiceWorker()],
  worker: { format: "es" },
  build: { target: "es2020" },
});
