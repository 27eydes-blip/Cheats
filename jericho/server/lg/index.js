// The two LG webOS TVs, by room: "living room" and "blue room" (settings.json lg.rooms).
// Pairing finds a TV on the home network (port 3001), shows its pairing prompt, and saves its IP,
// MAC and client key under the room name in data/lg-keys.json (git-ignored, never logged).
// Commands name the room; with none named the last room used is meant; if that's unclear,
// Jericho asks "Living room or blue room?". If a TV's IP changes it's found again by its MAC,
// and "turn on" uses Wake-on-LAN to that MAC.
import fs from "node:fs";
import path from "node:path";
import { ROOT, settings } from "../config.js";
import { logAction } from "../logger.js";
import { isLocalAddress } from "../roku/ecp.js";
import { arpTable, normalizeMac, scanSubnets, sendWol } from "./net.js";
import { connectSsap, LgError } from "./ssap.js";

const DEFAULT_ROOMS = [
  { name: "living room", aliases: ["living room tv", "the living room", "living room"] },
  { name: "blue room", aliases: ["blue room tv", "the blue room", "blue room"] },
];

export function lgSettings(s = settings) {
  const lg = s.lg || {};
  const rooms = (Array.isArray(lg.rooms) && lg.rooms.length ? lg.rooms : DEFAULT_ROOMS).map((r) => ({
    name: String(r.name).toLowerCase().trim(),
    aliases: [...new Set([String(r.name).toLowerCase().trim(), ...(r.aliases || []).map((a) => String(a).toLowerCase().trim())])].filter(Boolean),
  }));
  return {
    rooms,
    candidates: (Array.isArray(lg.candidates) ? lg.candidates : ["192.168.4.217", "192.168.4.48"]).filter(isLocalAddress),
    pairTimeoutSeconds: Number(lg.pairTimeoutSeconds) > 0 ? Number(lg.pairTimeoutSeconds) : 60,
    port: Number(lg.port) > 0 ? Number(lg.port) : 3001,
    volumeStep: Number(lg.volumeStep) > 0 ? Number(lg.volumeStep) : 5,
  };
}

// ---- saved TVs: data/lg-keys.json -------------------------------------------------------------
const keysFile = () => path.join(process.env.JERICHO_DATA_DIR || path.join(ROOT, "data"), "lg-keys.json");

export function loadKeys() {
  try {
    const raw = JSON.parse(fs.readFileSync(keysFile(), "utf8"));
    return { rooms: raw.rooms && typeof raw.rooms === "object" ? raw.rooms : {}, lastRoom: raw.lastRoom || "" };
  } catch {
    return { rooms: {}, lastRoom: "" };
  }
}

function saveKeys(k) {
  const f = keysFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(k, null, 1), { mode: 0o600 });
  fs.renameSync(`${f}.tmp`, f);
}

/** What's paired, without the keys (for the page, logs and answers). */
export function pairedRooms() {
  const k = loadKeys();
  return Object.entries(k.rooms).map(([room, v]) => ({ room, ip: v.ip, mac: v.mac, pairedAt: v.pairedAt }));
}

function rememberRoom(room) {
  const k = loadKeys();
  if (k.lastRoom === room) return;
  k.lastRoom = room;
  saveKeys(k);
}

// ---- which room ---------------------------------------------------------------------------------
const ALL_RE = /\b(all (?:the |of the |my )?(?:lg )?(?:tvs|televisions|tv's)|both (?:the )?(?:lg )?(?:tvs|televisions)|every (?:lg )?tv|(?:the )?(?:lg )?tvs everywhere)\b/i;

/** The room named in the text ("blue room TV", "the living room"), "all", or null. */
export function findRoom(text, cfg = lgSettings()) {
  const t = String(text || "").toLowerCase().replace(/[’']/g, "'");
  if (ALL_RE.test(t)) return "all";
  let best = null;
  for (const r of cfg.rooms) {
    for (const a of r.aliases) {
      const re = new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i");
      if (re.test(t) && (!best || a.length > best.len)) best = { name: r.name, len: a.length };
    }
  }
  return best?.name || null;
}

export const ROOM_QUESTION = (cfg = lgSettings()) => `${cfg.rooms.map((r) => r.name).join(" or ").replace(/^./, (c) => c.toUpperCase())}?`;

/**
 * The room to use: the one named, else the last room used, else the only one paired, else a
 * question. "all" only where allowed (turning them off).
 */
export function resolveRoom(spoken, { allowAll = false, cfg = lgSettings() } = {}) {
  const named = findRoom(spoken, cfg);
  if (named === "all") return allowAll ? { ok: true, room: "all" } : { ok: false, ask: ROOM_QUESTION(cfg) };
  if (named) return { ok: true, room: named };
  const k = loadKeys();
  if (k.lastRoom && cfg.rooms.some((r) => r.name === k.lastRoom)) return { ok: true, room: k.lastRoom, assumed: true };
  const paired = Object.keys(k.rooms);
  if (paired.length === 1) return { ok: true, room: paired[0], assumed: true };
  return { ok: false, ask: ROOM_QUESTION(cfg) };
}

// ---- the network side (swapped for fakes in tests) ----------------------------------------------
let deps = { connect: connectSsap, scan: scanSubnets, arp: arpTable, wol: sendWol };
export function _setLgDepsForTests(d) {
  deps = { ...deps, ...d };
}

const cap = (room) => room.replace(/^./, (c) => c.toUpperCase());

/** A registered connection to a room's TV, finding it again by MAC if its IP changed. */
async function session(room, cfg) {
  const k = loadKeys();
  const entry = k.rooms[room];
  if (!entry?.clientKey) throw new LgError(`The ${room} TV isn't paired yet. Say "pair the ${room} TV".`, "not-paired");
  try {
    return await deps.connect(entry.ip, { clientKey: entry.clientKey, promptTimeoutMs: 15_000 });
  } catch (err) {
    if (!["unreachable", "closed", "timeout"].includes(err.code) || !entry.mac) throw err;
    // the TV may have a new address: look for its MAC among the TVs on the network
    const open = await deps.scan(cfg.port);
    const table = await deps.arp();
    const ip = open.find((x) => normalizeMac(table[x]) === normalizeMac(entry.mac));
    if (!ip || ip === entry.ip) throw new LgError(`The ${room} TV isn't answering. It may be off: say "turn on the ${room} TV".`, "unreachable");
    const fresh = loadKeys();
    fresh.rooms[room] = { ...fresh.rooms[room], ip };
    saveKeys(fresh);
    logAction("lg_rediscovered", { room }); // never the address or key
    return deps.connect(ip, { clientKey: entry.clientKey, promptTimeoutMs: 15_000 });
  }
}

// Well-known webOS app ids, used when the TV's own app list doesn't have a better match.
const KNOWN_APPS = { netflix: "netflix", youtube: "youtube.leanback.v4", "prime video": "amazon", amazon: "amazon", prime: "amazon", "disney+": "com.disney.disneyplus-prod", disney: "com.disney.disneyplus-prod", hulu: "hulu", max: "com.hbo.hbomax", "hbo max": "com.hbo.hbomax", spotify: "spotify-beehive", "apple tv": "com.apple.appletv", plex: "cdp-30", peacock: "com.peacocktv.peacock", "paramount+": "com.cbs-ent.paramountplus", paramount: "com.cbs-ent.paramountplus", "live tv": "com.webos.app.livetv", browser: "com.webos.app.browser" };

async function findApp(tv, name) {
  const want = String(name || "").toLowerCase().replace(/\bplus\b/, "+").replace(/\s+/g, " ").trim();
  try {
    const { apps = [] } = await tv.request("ssap://com.webos.applicationManager/listApps");
    const norm = (s) => String(s).toLowerCase().replace(/\bplus\b/, "+").replace(/[^a-z0-9+ ]/g, "").trim();
    const hit = apps.find((a) => norm(a.title) === norm(want)) || apps.find((a) => norm(a.title).startsWith(norm(want))) || apps.find((a) => norm(a.title).includes(norm(want)));
    if (hit) return { id: hit.id, title: hit.title };
  } catch {
    /* fall back to the known ids */
  }
  const id = KNOWN_APPS[want] || KNOWN_APPS[want.replace(/\+$/, "")];
  return id ? { id, title: name } : null;
}

export const ACTIONS = ["power_on", "power_off", "volume_set", "volume_up", "volume_down", "mute", "unmute", "open_app", "play", "pause", "input", "status"];

/** One action on one room's TV. Returns { ok, say } or { ok: false, error }. */
export async function lgCommand(room, action, input = {}, cfg = lgSettings()) {
  if (!cfg.rooms.some((r) => r.name === room)) return { ok: false, error: `I don't know a TV called ${room}.` };
  rememberRoom(room);
  const t0 = Date.now();
  let result;
  try {
    result = await run(room, action, input, cfg);
  } catch (err) {
    result = { ok: false, error: err instanceof LgError ? err.message : `The ${room} TV didn't answer.`, reason: err.code || "error" };
  }
  logAction("lg_action", { room, action, ok: result.ok, ...(result.ok ? {} : { reason: result.reason || "refused" }), ms: Date.now() - t0 });
  return result;
}

async function run(room, action, input, cfg) {
  if (action === "power_on") {
    const entry = loadKeys().rooms[room];
    if (!entry) throw new LgError(`The ${room} TV isn't paired yet. Say "pair the ${room} TV".`, "not-paired");
    if (!entry.mac) throw new LgError(`I don't know the ${room} TV's MAC address, so I can't wake it. Pair it again while it's on.`, "no-mac");
    await deps.wol(entry.mac, { ip: entry.ip });
    return { ok: true, say: `Turning on the ${room} TV.`, note: "Wake-on-LAN sent. If it stays off, turn on 'Turn on via Wi-Fi' (or 'Mobile TV On') in the TV's settings." };
  }
  const tv = await session(room, cfg);
  try {
    switch (action) {
      case "power_off":
        await tv.request("ssap://system/turnOff");
        return { ok: true, say: `${cap(room)} TV off.` };
      case "volume_set": {
        const v = Math.max(0, Math.min(100, Math.round(Number(input.volume))));
        if (!Number.isFinite(v)) return { ok: false, error: "What volume?" };
        await tv.request("ssap://audio/setVolume", { volume: v });
        return { ok: true, say: `${cap(room)} volume ${v}.` };
      }
      case "volume_up":
      case "volume_down": {
        const step = Math.max(1, Math.min(30, Math.round(Number(input.steps) || cfg.volumeStep)));
        let now = null;
        try {
          const r = await tv.request("ssap://audio/getVolume");
          now = Number(r.volume ?? r.volumeStatus?.volume);
        } catch {
          /* older sets: step instead */
        }
        if (Number.isFinite(now)) {
          const v = Math.max(0, Math.min(100, now + (action === "volume_up" ? step : -step)));
          await tv.request("ssap://audio/setVolume", { volume: v });
          return { ok: true, say: `${cap(room)} volume ${v}.` };
        }
        for (let i = 0; i < step; i++) await tv.request(action === "volume_up" ? "ssap://audio/volumeUp" : "ssap://audio/volumeDown");
        return { ok: true, say: `Turned the ${room} ${action === "volume_up" ? "up" : "down"}.` };
      }
      case "mute":
      case "unmute":
        await tv.request("ssap://audio/setMute", { mute: action === "mute" });
        return { ok: true, say: `${cap(room)} ${action === "mute" ? "muted" : "unmuted"}.` };
      case "open_app": {
        const app = await findApp(tv, input.app);
        if (!app) return { ok: false, error: `I couldn't find ${input.app} on the ${room} TV.` };
        await tv.request("ssap://system.launcher/launch", { id: app.id });
        return { ok: true, say: `${app.title.replace(/^./, (c) => c.toUpperCase())} on the ${room} TV.`, app: app.title };
      }
      case "play":
      case "pause":
        await tv.request(`ssap://media.controls/${action}`);
        return { ok: true, say: action === "play" ? "Playing." : "Paused." };
      case "input": {
        const n = Number(/\d/.exec(String(input.input || ""))?.[0]);
        if (!n) return { ok: false, error: "Which input? HDMI 1, 2, 3 or 4?" };
        await tv.request("ssap://tv/switchInput", { inputId: `HDMI_${n}` });
        return { ok: true, say: `${cap(room)} TV on HDMI ${n}.` };
      }
      case "status": {
        const vol = await tv.request("ssap://audio/getVolume").catch(() => ({}));
        const fg = await tv.request("ssap://com.webos.applicationManager/getForegroundAppInfo").catch(() => ({}));
        const v = vol.volume ?? vol.volumeStatus?.volume;
        return { ok: true, say: `The ${room} TV is on${fg.appId ? `, in ${fg.appId.replace(/^com\.\w+\.(app\.)?/, "")}` : ""}${v != null ? `, volume ${v}` : ""}.` };
      }
      default:
        return { ok: false, error: `Unknown TV action ${action}.` };
    }
  } finally {
    tv.close();
  }
}

/** "Turn off all the TVs": both LGs (the Roku is separate). */
export async function lgAllOff(cfg = lgSettings()) {
  const rooms = Object.keys(loadKeys().rooms).filter((r) => cfg.rooms.some((x) => x.name === r));
  if (!rooms.length) return { ok: false, error: "No LG TVs are paired yet." };
  const results = await Promise.all(rooms.map((r) => lgCommand(r, "power_off", {}, cfg)));
  const off = rooms.filter((_, i) => results[i].ok);
  const failed = rooms.filter((_, i) => !results[i].ok);
  return { ok: off.length > 0, say: `${off.length ? `${off.map(cap).join(" and ")} off.` : ""}${failed.length ? ` The ${failed.join(" and ")} TV didn't answer.` : ""}`.trim(), error: off.length ? undefined : results[0].error };
}

// ---- pairing --------------------------------------------------------------------------------------

/**
 * Pairs a room: scans for port 3001, then tries the candidates one at a time (192.168.4.217 and
 * 192.168.4.48 first). Each try puts a pairing prompt on whichever TV is at that address;
 * `onPrompt(ip)` is called so they can be told to accept it. The other room's TV is skipped.
 * For the first room only one TV should be on; if two answer, it stops and says so (force skips that).
 */
export async function pairRoom(room, { onPrompt = () => {}, force = false, cfg = lgSettings() } = {}) {
  const r = cfg.rooms.find((x) => x.name === room);
  if (!r) return { ok: false, error: `I don't know a TV called ${room}. Say ${ROOM_QUESTION(cfg).replace("?", "")}.` };
  const keys = loadKeys();
  const taken = new Set(Object.entries(keys.rooms).filter(([n]) => n !== room).map(([, v]) => v.ip));
  let open = [];
  try {
    open = await deps.scan(cfg.port);
  } catch {
    open = [];
  }
  const others = open.filter((ip) => !taken.has(ip));
  if (!force && taken.size === 0 && others.length > 1) {
    return { ok: false, error: `I can see ${others.length} TVs on. For the first room, turn the other TV off so I know which is which, then ask again.`, found: others.length };
  }
  const order = [...new Set([...cfg.candidates.filter((ip) => !taken.has(ip) && (!open.length || open.includes(ip))), ...others])];
  // nothing answered the scan (or it was blocked): still try the usual addresses
  if (!order.length) for (const ip of cfg.candidates) if (!taken.has(ip)) order.push(ip);
  logAction("lg_pair_start", { room, tries: order.length });
  for (const ip of order) {
    let tv;
    try {
      tv = await deps.connect(ip, { clientKey: "", onPrompt: () => onPrompt(ip), promptTimeoutMs: cfg.pairTimeoutSeconds * 1000 });
    } catch (err) {
      if (err.code === "rejected") return { ok: false, error: "The pairing prompt was declined on the TV." };
      continue; // nobody there, or the prompt timed out: next address
    }
    try {
      let mac = normalizeMac((await deps.arp().catch(() => ({})))[ip]);
      if (!mac) {
        const info = await tv.request("ssap://com.webos.service.connectionmanager/getinfo").catch(() => ({}));
        mac = normalizeMac(info.wiredInfo?.macAddress) || normalizeMac(info.wifiInfo?.macAddress);
      }
      const fresh = loadKeys();
      fresh.rooms[room] = { ip, mac, clientKey: tv.clientKey, pairedAt: new Date().toISOString() };
      fresh.lastRoom = room;
      saveKeys(fresh);
      logAction("lg_paired", { room, hasMac: Boolean(mac) }); // never the key or address
      await tv.request("ssap://system.notifications/createToast", { message: `Paired with Jericho as the ${room} TV` }).catch(() => {});
      return { ok: true, room, ip, mac, say: `The ${room} TV is paired${mac ? "" : ", but I couldn't read its MAC address, so turning it on by voice won't work yet"}.` };
    } finally {
      tv.close();
    }
  }
  return { ok: false, error: `I couldn't pair the ${room} TV. Make sure it's on and on the same network, then try again and accept the prompt on the TV.` };
}
