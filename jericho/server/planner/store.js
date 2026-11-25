// The Planner's own data: data/planner.json (git-ignored, local only). Classes (weekly),
// homework, events (one-off or weekly) and study blocks (drafts until you accept them).
// Every change bumps `version` and emits "changed", so the page updates live.
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT } from "../config.js";
import { logAction } from "../logger.js";

export const TYPES = ["class", "homework", "event", "study_block"];
export const plannerEvents = new EventEmitter();

const file = () => path.join(process.env.JERICHO_DATA_DIR || path.join(ROOT, "data"), "planner.json");
let cache = null;
let cacheFile = "";

export function load() {
  const f = file();
  if (cache && cacheFile === f) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(f, "utf8"));
    cache = { version: Number(raw.version) || 0, items: Array.isArray(raw.items) ? raw.items.filter((i) => i && TYPES.includes(i.type) && i.id) : [] };
  } catch {
    cache = { version: 0, items: [] };
  }
  cacheFile = f;
  return cache;
}

function save(why) {
  const f = file();
  cache.version += 1;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 1));
  fs.renameSync(tmp, f); // never a half-written file
  plannerEvents.emit("changed", { version: cache.version, why });
}

const clean = (s, n = 120) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);

/** Only the fields each type has, cleaned. */
function shape(item) {
  const base = { id: item.id, type: item.type, title: clean(item.title) || "Untitled" };
  switch (item.type) {
    case "class":
      return { ...base, days: [...new Set((item.days || []).map(Number).filter((d) => d >= 0 && d <= 6))].sort(), start: item.start, end: item.end, location: clean(item.location, 80), from: item.from || null, until: item.until || null };
    case "homework":
      return { ...base, subject: clean(item.subject, 60), due: item.due, minutes: Math.max(5, Math.min(1440, Math.round(Number(item.minutes) || 30))), done: Boolean(item.done), doneAt: item.done ? item.doneAt || new Date().toISOString() : null };
    case "event":
      return { ...base, kind: clean(item.kind, 30), start: item.start, end: item.end, allDay: Boolean(item.allDay), repeat: item.repeat === "weekly" ? "weekly" : "none", until: item.until || null, location: clean(item.location, 80) };
    case "study_block":
      return { ...base, homeworkId: item.homeworkId || null, start: item.start, end: item.end, status: item.status === "accepted" ? "accepted" : "draft" };
    default:
      return base;
  }
}

export function list() {
  return load().items;
}

export function get(id) {
  return load().items.find((i) => i.id === id) || null;
}

export function add(item, why = "add") {
  load();
  const it = shape({ ...item, id: item.id || crypto.randomUUID().slice(0, 8) });
  cache.items.push(it);
  save(why);
  logAction("planner_changed", { op: "add", type: it.type, id: it.id }); // never titles
  return it;
}

export function update(id, patch, why = "update") {
  load();
  const i = cache.items.findIndex((x) => x.id === id);
  if (i < 0) return null;
  cache.items[i] = shape({ ...cache.items[i], ...patch, id, type: cache.items[i].type });
  save(why);
  logAction("planner_changed", { op: why, type: cache.items[i].type, id });
  return cache.items[i];
}

export function remove(id, why = "delete") {
  load();
  const before = cache.items.length;
  const gone = cache.items.find((x) => x.id === id);
  cache.items = cache.items.filter((x) => x.id !== id);
  if (cache.items.length === before) return null;
  save(why);
  logAction("planner_changed", { op: why, type: gone.type, id });
  return gone;
}

/** Several changes in one save (accepting or rejecting a whole draft plan). */
export function batch(fn, why = "batch") {
  load();
  const out = fn(cache.items, shape);
  cache.items = out.items.map(shape);
  save(why);
  logAction("planner_changed", { op: why, count: out.count ?? 0 });
  return out;
}

export function version() {
  return load().version;
}

/** Tests only. */
export function _resetPlannerForTests() {
  cache = null;
  cacheFile = "";
}
