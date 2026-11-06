// © 2026 Sam Eyde III. All rights reserved. Glydrift — see LICENSE. Not open source.
// Tiny event log. Events are batched (every 15 s, 20 events, or when the page hides) so
// logging never costs a frame. No endpoint is configured yet, so batches are kept on the
// device (last 200, localStorage "glydrift.analytics.v1"); set Analytics.endpoint to a URL
// to send them with navigator.sendBeacon instead. Nothing is logged in dev / test builds.
import { Save } from "../data/save.js";
import { TEST } from "./testFlags.js";

const KEY = "glydrift.analytics.v1";
let queue = [];
let timer = null;

export const Analytics = {
  endpoint: null,

  log(event, props = {}) {
    if (TEST.on || import.meta.env.DEV) return;
    if (Save.data.settings.analytics === false) return;
    queue.push({ event, t: Date.now(), ...props });
    if (queue.length >= 20) this.flush();
    else if (!timer) timer = setTimeout(() => this.flush(), 15000);
  },

  flush() {
    clearTimeout(timer);
    timer = null;
    if (!queue.length) return;
    const batch = queue;
    queue = [];
    if (this.endpoint && navigator.sendBeacon?.(this.endpoint, JSON.stringify(batch))) return;
    try {
      const kept = JSON.parse(localStorage.getItem(KEY) || "[]")
        .concat(batch)
        .slice(-200);
      localStorage.setItem(KEY, JSON.stringify(kept));
    } catch {}
  },
};

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => Analytics.flush());
  // iOS can kill a backgrounded home-screen app without a pagehide: save when it hides too
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") Analytics.flush();
  });
}
