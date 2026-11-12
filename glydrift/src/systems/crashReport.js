// Crash reporting: errors (and runs the phone closed mid-way) are sent to Supabase table
// crash_reports (supabase/migrations/20261107000003_crash_reports.sql) with the device,
// browser, build and where the run was: score, distance, realm, hero. Anyone can add a report,
// nobody can read them from the app (the owner reads them in Supabase). Reports wait in a small
// local queue when offline; at most 6 per session, each message once.
import { BUILD } from "./updater.js";
import { TEST } from "./testFlags.js";

const KEY = "glydrift.crashq";
const MAX_SESSION = 6;
let sentThisSession = 0;
const seen = new Set();
let liveContext = null; // () => { score, distance, realm, hero, mode, scene } from the game
let clientFn = null; // () => Promise<supabase client>
let flushing = null; // the upload in progress
let flushHook = null; // test builds only

// noise that isn't the game's fault: lost network, browser extensions, a cancelled fetch
const IGNORE =
  /Failed to fetch|Load failed|NetworkError|network error|AbortError|ResizeObserver loop|chrome-extension|moz-extension|safari-extension|Script error\.?$/i;

function device() {
  const ua = navigator.userAgent || "";
  const model = /iPad|iPhone|iPod/.test(ua)
    ? ua.match(/(iPhone|iPad|iPod)[^;)]*/)?.[0]
    : /Android/.test(ua)
      ? ua.match(/Android[^;)]*;?[^;)]*/)?.[0]
      : /Mac OS X/.test(ua)
        ? // iPadOS Safari says "Macintosh": a touch screen gives it away
          (navigator.maxTouchPoints || 0) > 1
          ? "iPad"
          : "Mac"
        : /Windows/.test(ua)
          ? "Windows"
          : "other";
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    navigator.standalone === true;
  return `${model || "?"}${standalone ? " · home screen app" : ""}`;
}

function browser() {
  const ua = navigator.userAgent || "";
  const m =
    ua.match(/(CriOS|FxiOS|EdgiOS|Edg|Chrome|Firefox)\/[\d.]+/) ||
    (/Safari/.test(ua) ? ua.match(/Version\/[\d.]+/) : null);
  const os = ua.match(/OS (\d+[_\d]*) like Mac OS X/)?.[1]?.replace(/_/g, ".");
  return `${m ? m[0].replace("Version", "Safari").replace("CriOS", "Chrome iOS") : "?"}${os ? ` · iOS ${os}` : ""}`.slice(
    0,
    120,
  );
}

// never personal info in a report: email addresses, tokens and keys, ids, URLs with queries
function scrub(text) {
  return String(text ?? "")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "<email>")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<token>")
    .replace(/\b(sb_[a-z]+_)[\w-]+/gi, "$1<key>")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "<id>",
    )
    .replace(/([?&#][\w-]+=)[^&\s"')]+/g, "$1…");
}

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function writeQueue(q) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q.slice(-20)));
  } catch {}
}

export const CrashReport = {
  scrub,
  /** The game says how to read the run in progress (score, distance, realm…). */
  setContext(fn) {
    liveContext = fn;
  },
  /** How to reach Supabase (the leaderboard's client: publishable key + RLS). */
  setClient(fn) {
    clientFn = fn;
  },

  /**
   * Record one crash. kind: "error" | "rejection" | "frame" | "killed_mid_run" | "recovered".
   * extra: anything known about the run when live context isn't available (e.g. a checkpoint).
   */
  report(kind, err, extra = {}) {
    try {
      const message = scrub(err?.message ?? err ?? kind).slice(0, 300);
      if (kind !== "killed_mid_run" && IGNORE.test(message)) return null;
      const dedupe = `${kind}|${message}`;
      if (seen.has(dedupe) || sentThisSession >= MAX_SESSION) return null;
      seen.add(dedupe);
      sentThisSession++;
      let live = null;
      try {
        live = liveContext?.() || null;
      } catch {}
      const src = { ...extra, ...(live || {}) };
      const mem = performance?.memory?.usedJSHeapSize;
      const row = {
        kind,
        message,
        stack: scrub(err?.stack || "")
          .split("\n")
          .slice(0, 8)
          .join(" | ")
          .slice(0, 1500),
        build: BUILD,
        device: device(),
        browser: browser(),
        screen: `${screen.width}x${screen.height}@${window.devicePixelRatio || 1}`,
        score: Number.isFinite(src.score) ? Math.round(src.score) : null,
        distance: Number.isFinite(src.distance)
          ? Math.round(src.distance)
          : null,
        realm: src.realm ? String(src.realm).slice(0, 40) : null,
        hero: src.hero ? String(src.hero).slice(0, 40) : null,
        mode: src.mode ? String(src.mode).slice(0, 20) : null,
        scene: src.scene ? String(src.scene).slice(0, 80) : null,
        memory_mb: mem ? Math.round(mem / 1048576) : null,
        at: new Date().toISOString(),
      };
      const q = readQueue();
      q.push(row);
      writeQueue(q);
      this.flush();
      return row;
    } catch {
      return null;
    }
  },

  /** Send what's queued (best effort; kept for later when offline or not set up yet). */
  async flush() {
    if (TEST.on && !flushHook) return; // test builds keep them in the queue for the tests to read
    if (!clientFn && !flushHook) return;
    // one upload at a time, and the rows leave the queue BEFORE they're sent: two overlapping
    // flushes (two reports in a row at launch) used to send the same rows twice, and a page
    // closed mid-upload resent them at the next launch (duplicate pairs in crash_reports)
    if (flushing) return flushing;
    flushing = (async () => {
      const q = readQueue();
      if (!q.length) return;
      writeQueue([]);
      try {
        const rows = q.map(({ at, ...r }) => ({ ...r, happened_at: at }));
        const error = flushHook
          ? await flushHook(rows)
          : (await (await clientFn()).from("crash_reports").insert(rows)).error;
        if (error) throw error;
      } catch {
        writeQueue([...q, ...readQueue()]); // offline / refused: back in the queue for next time
      }
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  },

  /** test builds only: send the queue through fn(rows) instead of Supabase. */
  setFlushHook(fn) {
    if (TEST.on) flushHook = fn;
  },

  queued: readQueue,

  /** Catch everything the game doesn't: script errors and rejected promises. */
  install() {
    window.addEventListener("error", (e) =>
      this.report("error", e.error || e.message),
    );
    window.addEventListener("unhandledrejection", (e) =>
      this.report("rejection", e.reason),
    );
  },
};
