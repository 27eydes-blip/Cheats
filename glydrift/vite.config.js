import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// Stamp the service worker's cache name on every build so installed copies update.
const stampServiceWorker = () => ({
  name: "stamp-sw",
  apply: "build",
  closeBundle() {
    const p = resolve(import.meta.dirname, "dist/sw.js");
    writeFileSync(p, readFileSync(p, "utf8").replace("__BUILD__", Date.now().toString(36)));
  },
});

export default defineConfig(({ mode }) => ({
  base: "./",
  // test-only URL flags (?god, ?lucky, ?dimension=…): dev server or GLY_TEST=1 builds only
  define: { __TEST_FLAGS__: JSON.stringify(mode === "development" || process.env.GLY_TEST === "1") },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 2000,
  },
  plugins: [stampServiceWorker()],
  server: { host: true },
}));
