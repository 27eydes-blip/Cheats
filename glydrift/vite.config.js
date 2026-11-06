import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { MANIFEST, musicHash } from "./scripts/music/hash.mjs";

// Stamp the service worker's cache name on every build so installed copies update.
const stampServiceWorker = () => {
  let outDir = "dist";
  return {
    name: "stamp-sw",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir; // test builds go to their own folder
    },
    closeBundle() {
      const p = resolve(import.meta.dirname, outDir, "sw.js");
      writeFileSync(p, readFileSync(p, "utf8").replace("__BUILD__", Date.now().toString(36)));
    },
  };
};

// The soundtrack is pre-rendered (npm run music): never ship audio rendered from an older
// version of the composition.
const freshMusic = () => ({
  name: "fresh-music",
  apply: "build",
  buildStart() {
    const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
    if (m.hash !== musicHash() || m.complete === false)
      this.error("the music sources changed since the soundtrack was rendered: run `npm run music`");
  },
});

export default defineConfig(({ mode }) => ({
  // served from the root of https://glydrift.com (Cloudflare Pages). The old GitHub Pages copy
  // (a sub-folder) builds with GLY_BASE=./ until it is replaced by a redirect.
  base: process.env.GLY_BASE || "/",
  // test-only URL flags (?god, ?lucky, ?dimension=…): dev server or GLY_TEST=1 builds only
  define: {
    __TEST_FLAGS__: JSON.stringify(mode === "development" || process.env.GLY_TEST === "1"),
  },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 2000,
    rolldownOptions: {
      output: {
        // the engine and the audio library get their own files: the game code stays small and
        // a game update doesn't make returning players download Phaser again
        codeSplitting: {
          groups: [
            { name: "phaser", test: /node_modules[\\/]phaser[\\/]/ },
            { name: "tone", test: /node_modules[\\/]tone[\\/]/ },
          ],
        },
      },
    },
  },
  plugins: [freshMusic(), stampServiceWorker()],
  server: { host: true },
}));
