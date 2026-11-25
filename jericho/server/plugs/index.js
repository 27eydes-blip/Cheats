// Tapo smart plugs (P100 / P105 / P110) on the home network, by name: settings.json plugs.devices
// ("Fan", "Lamp", ...) and plugs.groups ("lights" -> Lamp). Local control through the
// tp-link-tapo-connect library (KLAP, with the older protocol as its fallback).
//
// Credentials: TAPO_EMAIL and TAPO_PASSWORD, only from .env. They're only ever handed to the
// library: never logged, spoken, stored in data/, sent to the page, or given to child processes.
// To keep them from going to random devices, they're only sent to a device whose MAC address is
// one of the plugs on your Tapo account (from the account's device list), or, if the account
// list can't be read, a TP-Link MAC prefix.
//
// Found plugs are cached in data/plugs.json (name, IP, MAC, model; no credentials). If a plug's
// IP changes, it's found again. Timers ("turn off the fan in 30 minutes") are kept in
// data/plug-timers.json, so they survive a restart.
import fs from "node:fs";
import path from "node:path";
import { ROOT, settings } from "../config.js";
import { logAction } from "../logger.js";
import { isLocalAddress } from "../roku/ecp.js";
import { arpTable, normalizeMac, scanSubnets } from "../lg/net.js";

export const TIP = "Check that it's plugged in and on the same Wi-Fi as this PC (the 2.4 GHz network), and that Third-Party Compatibility is on in the Tapo app (Me, Tapo Lab or Third-Party Services).";
const NO_CREDS = "Tapo isn't set up yet: add TAPO_EMAIL and TAPO_PASSWORD to the .env file, then restart me.";

// TP-Link / Tapo MAC prefixes, only used when the account's device list can't be read.
const TPLINK_OUI = ["84:d8:1b", "e4:fa:c4", "ac:84:c6", "50:c7:bf", "1c:3b:f3", "28:87:ba", "30:de:4b", "3c:52:a1", "40:ed:00", "48:22:54", "54:af:97", "5c:62:8b", "60:a4:b7", "68:ff:7b", "6c:5a:b0", "78:8c:b5", "98:25:4a", "9c:53:22", "a8:42:a1", "b0:19:21", "b0:95:75", "c0:06:c3", "cc:ba:bd", "d8:07:b6", "f0:a7:31", "14:eb:b6", "34:60:f9", "5c:a6:e6", "a0:f3:c1", "b4:b0:24"];

// ---- settings: names, aliases and groups ------------------------------------------------------
export function plugSettings(s = settings) {
  const p = s.plugs || {};
  const devices = (Array.isArray(p.devices) && p.devices.length ? p.devices : [{ name: "Fan", aliases: ["the fan", "fan"] }, { name: "Lamp", aliases: ["the lamp", "my lamp", "lamp"] }])
    .filter((d) => d && String(d.name || "").trim())
    .map((d) => ({ name: String(d.name).trim(), aliases: [...new Set([String(d.name).trim().toLowerCase(), ...(d.aliases || []).map((a) => String(a).toLowerCase().trim())])].filter(Boolean) }));
  const groups = (Array.isArray(p.groups) ? p.groups : [])
    .filter((g) => g && g.name && Array.isArray(g.devices))
    // only the aliases listed: "all lights" by default, so a plain "the lights" still means the lights tool
    .map((g) => ({ name: String(g.name).trim().toLowerCase(), aliases: [...new Set((g.aliases?.length ? g.aliases : [`all ${g.name}`]).map((a) => String(a).toLowerCase().trim()))], devices: g.devices.map(String) }));
  return { devices, groups, timeoutMs: (Number(p.timeoutSeconds) > 0 ? Number(p.timeoutSeconds) : 6) * 1000 };
}

/** Credentials from .env only. */
function creds(env = process.env) {
  return { email: String(env.TAPO_EMAIL || "").trim(), password: String(env.TAPO_PASSWORD || "") };
}
/** "set" / "missing" for each, for the self-test and npm run plugs:test. Never the values. */
export function credStatus(env = process.env) {
  return { TAPO_EMAIL: env.TAPO_EMAIL?.trim() ? "set" : "missing", TAPO_PASSWORD: env.TAPO_PASSWORD ? "set" : "missing" };
}

// ---- the library and the network (swapped for fakes in tests) ---------------------------------
let deps = null;
async function libDeps() {
  if (deps) return deps;
  const lib = await import("tp-link-tapo-connect");
  const mod = lib.default || lib;
  deps = {
    login: (email, password, ip) => mod.loginDeviceByIp(email, password, ip),
    cloudPlugs: async (email, password) => {
      const cloud = await mod.cloudLogin(email, password);
      return (await cloud.listDevicesByType("SMART.TAPOPLUG")).map((d) => ({ name: d.alias || d.deviceName || "", mac: normalizeMac(String(d.deviceMac || "").replace(/(..)(?!$)/g, "$1:")), model: d.deviceModel || "" }));
    },
    scan: () => scanSubnets(80),
    arp: arpTable,
  };
  return deps;
}
export function _setPlugDepsForTests(d) {
  deps = d ? { login: async () => { throw new Error("no fake"); }, cloudPlugs: async () => [], scan: async () => [], arp: async () => ({}), ...d } : null;
  sessions.clear();
}

class PlugError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/** Any library call, with our own time limit (the library has none). Library errors are never passed on as text. */
async function limited(promise, ms, code = "unreachable") {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, rej) => (timer = setTimeout(() => rej(new PlugError("timed out", code)), ms)))]);
  } catch (err) {
    if (err instanceof PlugError) throw err;
    // Tapo's own "wrong email or password" (-1501); anything else counts as unreachable
    throw new PlugError("failed", /(^|\D)-1501(\D|$)|invalid (?:request or )?credentials|missing credentials/i.test(String(err?.message)) ? "auth" : code);
  } finally {
    clearTimeout(timer);
  }
}

// ---- the cache: data/plugs.json and data/plug-timers.json -------------------------------------
const dataDir = () => process.env.JERICHO_DATA_DIR || path.join(ROOT, "data");
const cacheFile = () => path.join(dataDir(), "plugs.json");
const timersFile = () => path.join(dataDir(), "plug-timers.json");
const readJson = (f, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return fallback;
  }
};
const writeJson = (f, v) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(v, null, 1));
  fs.renameSync(`${f}.tmp`, f);
};
export const loadCache = () => readJson(cacheFile(), { plugs: {} });

// ---- names ------------------------------------------------------------------------------------------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

/** The plug or group named in the text: { plug: "Fan" } / { group: "lights", plugs: [...] } / { all: true } / null. */
export function findTarget(text, cfg = plugSettings()) {
  const t = ` ${String(text || "").toLowerCase().replace(/[’']/g, "'")} `;
  // a group ("all lights off", "turn off the lights"), unless a room is named ("the kitchen lights")
  const rooms = (settings.lights?.rooms || []).map((r) => String(r).toLowerCase());
  for (const g of cfg.groups) {
    for (const a of [...g.aliases].sort((x, y) => y.length - x.length)) {
      const m = new RegExp(`(\\S+)?\\s(?:all (?:of )?(?:the |my )?)?${esc(a)}\\b`).exec(t);
      if (!m) continue;
      const before = t.slice(0, m.index + (m[1] ? m[1].length : 0)).trim();
      if (rooms.some((r) => before.endsWith(r))) continue;
      return { group: g.name, plugs: g.devices };
    }
  }
  let best = null;
  for (const d of cfg.devices) for (const a of d.aliases) if (new RegExp(`\\b${esc(a)}\\b`).test(t) && (!best || a.length > best.len)) best = { plug: d.name, len: a.length };
  if (best) return { plug: best.plug };
  if (/\b(everything|all (?:the |my )?plugs|every plug|all of them)\b/.test(t)) return { all: true };
  return null;
}

const plugNames = (cfg) => cfg.devices.map((d) => d.name);
const say = (name) => name.toLowerCase();

// ---- discovery ------------------------------------------------------------------------------------

/**
 * Finds the plugs: the Tapo account's plug list (names and MACs), the network scan (port 80) and
 * the ARP table give each plug's IP; each one is logged into to read its name and state.
 * Returns { found: { Name: { ip, mac, model, on } }, missing: [names] }.
 */
export async function discover({ cfg = plugSettings(), env = process.env } = {}) {
  const { email, password } = creds(env);
  if (!email || !password) throw new PlugError(NO_CREDS, "no-creds");
  const d = await libDeps();
  let account = [];
  try {
    account = await limited(d.cloudPlugs(email, password), 10_000, "cloud");
  } catch {
    account = []; // offline or blocked: fall back to TP-Link MAC prefixes
  }
  const [open, table] = await Promise.all([d.scan().catch(() => []), d.arp().catch(() => ({}))]);
  const accountMacs = new Set(account.map((a) => a.mac).filter(Boolean));
  const candidates = open.filter((ip) => {
    if (!isLocalAddress(ip)) return false;
    const mac = normalizeMac(table[ip]);
    if (!mac) return false;
    return accountMacs.size ? accountMacs.has(mac) : TPLINK_OUI.includes(mac.slice(0, 8));
  });
  const wanted = new Map(cfg.devices.map((x) => [x.name.toLowerCase(), x.name]));
  const found = {};
  for (const ip of candidates) {
    try {
      const dev = await limited(d.login(email, password, ip), cfg.timeoutMs);
      const info = await limited(dev.getDeviceInfo(), cfg.timeoutMs);
      const mac = normalizeMac(info.mac || table[ip]);
      const nick = String(info.nickname || account.find((a) => a.mac === mac)?.name || "").trim();
      const name = wanted.get(nick.toLowerCase());
      if (!name) continue;
      found[name] = { ip, mac, model: String(info.model || "").slice(0, 20), on: Boolean(info.device_on) };
      sessions.set(name, { dev, ip, at: Date.now() });
    } catch (err) {
      if (err.code === "auth") throw new PlugError("Tapo didn't accept the email and password in .env.", "auth");
    }
  }
  const cache = loadCache();
  for (const [name, v] of Object.entries(found)) cache.plugs[name] = { ip: v.ip, mac: v.mac, model: v.model };
  writeJson(cacheFile(), cache);
  const missing = plugNames(cfg).filter((n) => !found[n]);
  logAction("plugs_discovered", { found: Object.keys(found).length, missing: missing.length, account: account.length, candidates: candidates.length });
  return { found, missing };
}

// ---- talking to one plug ------------------------------------------------------------------------
const sessions = new Map(); // name -> { dev, ip, at }: a logged-in plug, reused for 20 minutes
const SESSION_MS = 20 * 60_000;

async function device(name, cfg, { rediscover = true } = {}) {
  const { email, password } = creds();
  if (!email || !password) throw new PlugError(NO_CREDS, "no-creds");
  const s = sessions.get(name);
  if (s && Date.now() - s.at < SESSION_MS) return s.dev;
  const d = await libDeps();
  const cached = loadCache().plugs[name];
  if (cached?.ip && isLocalAddress(cached.ip)) {
    try {
      const dev = await limited(d.login(email, password, cached.ip), cfg.timeoutMs);
      sessions.set(name, { dev, ip: cached.ip, at: Date.now() });
      return dev;
    } catch (err) {
      if (err.code === "auth") throw new PlugError("Tapo didn't accept the email and password in .env.", "auth");
      /* moved or off: look for it again */
    }
  }
  if (!rediscover) throw new PlugError(`I can't reach the ${say(name)}. ${TIP}`, "unreachable");
  const r = await discover({ cfg });
  if (!r.found[name]) throw new PlugError(`I can't find the ${say(name)} on the network. ${TIP}`, "unreachable");
  if (cached?.ip && cached.ip !== r.found[name].ip) logAction("plug_rediscovered", { plug: name }); // never the address
  return sessions.get(name).dev;
}

/** One action on one plug, retrying once with a fresh login (sessions expire). */
async function onPlug(name, fn, cfg) {
  try {
    return await limited(fn(await device(name, cfg)), cfg.timeoutMs);
  } catch (err) {
    if (err.code === "no-creds" || err.code === "auth") throw err;
    sessions.delete(name);
    try {
      return await limited(fn(await device(name, cfg)), cfg.timeoutMs);
    } catch (err2) {
      if (err2 instanceof PlugError && /can't (reach|find)|isn't set up|didn't accept/.test(err2.message)) throw err2;
      throw new PlugError(`I can't reach the ${say(name)}. ${TIP}`, "unreachable");
    }
  }
}

export const ACTIONS = ["on", "off", "toggle", "status"];

/** "on" | "off" | "toggle" | "status" for one plug. Returns { ok, say, on } or { ok: false, error }. */
export async function plugAction(name, action, cfg = plugSettings()) {
  const plug = cfg.devices.find((d) => d.name.toLowerCase() === String(name).toLowerCase());
  if (!plug) return { ok: false, error: `I don't know a plug called ${name}. I have ${plugNames(cfg).map(say).join(" and ")}.` };
  const t0 = Date.now();
  let result;
  try {
    if (action === "status") {
      const info = await onPlug(plug.name, (dev) => dev.getDeviceInfo(), cfg);
      result = { ok: true, on: Boolean(info.device_on), say: `The ${say(plug.name)} is ${info.device_on ? "on" : "off"}.` };
    } else {
      let turnOn = action === "on";
      if (action === "toggle") turnOn = !(await onPlug(plug.name, (dev) => dev.getDeviceInfo(), cfg)).device_on;
      await onPlug(plug.name, (dev) => (turnOn ? dev.turnOn() : dev.turnOff()), cfg);
      result = { ok: true, on: turnOn, say: `${plug.name} ${turnOn ? "on" : "off"}.` };
    }
  } catch (err) {
    result = { ok: false, error: err instanceof PlugError ? err.message : `I can't reach the ${say(plug.name)}. ${TIP}`, reason: err.code || "error" };
  }
  logAction("plug_action", { plug: plug.name, action, ok: result.ok, ...(result.ok ? {} : { reason: result.reason }), ms: Date.now() - t0 });
  return result;
}

/** Several plugs at once ("turn everything off", "all lights off"). */
export async function plugsAction(names, action, cfg = plugSettings()) {
  const results = await Promise.all(names.map((n) => plugAction(n, action, cfg)));
  const ok = names.filter((_, i) => results[i].ok);
  const bad = names.filter((_, i) => !results[i].ok);
  if (!ok.length) return { ok: false, error: results[0]?.error || "No plugs answered." };
  const what = action === "on" ? "on" : "off";
  return { ok: true, say: `${ok.length === names.length && names.length > 1 ? `All ${names.length} ${what}` : `${ok.join(" and ")} ${what}`}.${bad.length ? ` I couldn't reach the ${bad.map(say).join(" or ")}.` : ""}` };
}

// ---- timers: "turn off the fan in 30 minutes" ---------------------------------------------------
const timers = new Map(); // id -> handle
export function listTimers() {
  return readJson(timersFile(), []);
}
function saveTimers(list) {
  writeJson(timersFile(), list);
}

/** Schedules an action; kept on disk, so it still happens after a restart. */
export function addTimer(plug, action, minutes, { now = Date.now(), announce = () => {} } = {}) {
  const m = Math.round(Number(minutes));
  if (!Number.isFinite(m) || m < 1 || m > 24 * 60) return { ok: false, error: "Timers can be from 1 minute to 24 hours." };
  const list = listTimers().filter((t) => !(t.plug === plug && t.action === action));
  const t = { id: Math.random().toString(36).slice(2, 10), plug, action, at: now + m * 60_000 };
  list.push(t);
  saveTimers(list);
  arm(t, { announce });
  logAction("plug_timer_set", { plug, action, minutes: m });
  const when = m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : m > 60 ? `${Math.floor(m / 60)} hour${m < 120 ? "" : "s"} ${m % 60} minutes` : `${m} minute${m === 1 ? "" : "s"}`;
  return { ok: true, say: `Okay, the ${say(plug)} goes ${action} in ${when}.` };
}

export function cancelTimers(plug) {
  const list = listTimers();
  const gone = list.filter((t) => !plug || t.plug === plug);
  for (const t of gone) {
    clearTimeout(timers.get(t.id));
    timers.delete(t.id);
  }
  saveTimers(list.filter((t) => !gone.includes(t)));
  return { ok: true, say: gone.length ? `Cancelled the ${plug ? `${say(plug)} ` : ""}timer${gone.length === 1 ? "" : "s"}.` : `There's no ${plug ? `${say(plug)} ` : "plug "}timer.` };
}

function arm(t, { announce }) {
  clearTimeout(timers.get(t.id));
  const wait = t.at - Date.now();
  if (wait <= 0) {
    setImmediate(() => fire(t.id, { announce })); // came due while Jericho was off: now
    return;
  }
  const handle = setTimeout(() => fire(t.id, { announce }), Math.min(wait, 2 ** 31 - 1));
  handle.unref?.(); // never keeps the process (or a test) alive
  timers.set(t.id, handle);
}

async function fire(id, { announce }) {
  timers.delete(id);
  const t = listTimers().find((x) => x.id === id);
  if (!t) return;
  saveTimers(listTimers().filter((x) => x.id !== id));
  const r = await plugAction(t.plug, t.action);
  announce(r.ok ? `${t.plug} ${t.action}, like you asked.` : r.error);
}

/** At startup: re-arm saved timers; ones that came due while Jericho was off run now. */
export function restoreTimers({ announce = () => {} } = {}) {
  const list = listTimers();
  for (const t of list) arm(t, { announce });
  if (list.length) logAction("plug_timers_restored", { count: list.length });
  return list.length;
}

/** Tests only. */
export function _clearTimersForTests() {
  for (const h of timers.values()) clearTimeout(h);
  timers.clear();
  sessions.clear();
}
