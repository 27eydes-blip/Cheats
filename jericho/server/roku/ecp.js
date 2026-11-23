// Roku TV control over Roku's External Control Protocol (ECP: plain HTTP on port 8060).
//   - The TV is found with SSDP discovery on the home network, or ROKU_IP in .env (which wins).
//   - The address found is cached in data/roku.json (not in git) and found again if it stops answering.
//   - Only private home-network addresses, and only devices that identify themselves as a Roku.
//   - Every request has a short timeout (2.5 s), so nothing hangs.
import dgram from "node:dgram";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../config.js";

export const ECP_PORT = 8060;
export const TIMEOUT_MS = 2500;

export const NOT_REACHABLE = "The TV isn't on the network. Check that it's on and on the same Wi-Fi as this PC.";
export const ACCESS_DENIED =
  "The TV refused the request. On the TV, go to Settings > System > Advanced system settings > Control by mobile apps > Network access, and set it to Default or Permissive.";
export const CANT_WAKE =
  "The TV isn't answering, so it may be fully off. Many Roku TVs can only be turned on over the network if Fast TV start is on (Settings > System > Power > Fast TV start); Roku sticks and boxes can't turn the TV on at all.";

/** Private (home network) IPv4 only: 10.x, 172.16-31.x, 192.168.x, and 169.254.x (link-local). */
export function isLocalAddress(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || "").trim());
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  if (d === 0 || d === 255) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

// ---- small XML helpers (ECP answers are simple, flat XML) -------------------------------------
const decode = (s) =>
  String(s ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
export function xmlField(xml, tag) {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(xml || "");
  return m ? decode(m[1].trim()) : "";
}
const attr = (tagText, name) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tagText || "");
  return m ? decode(m[1]) : "";
};

/** Is this /query/device-info answer from a Roku? */
export function looksLikeRoku(xml, serverHeader = "") {
  if (!/<device-info>/i.test(xml || "")) return false;
  return /roku/i.test(serverHeader) || /roku/i.test(xmlField(xml, "vendor-name")) || /roku/i.test(xmlField(xml, "model-name")) || /roku/i.test(xmlField(xml, "friendly-model-name")) || /roku/i.test(xmlField(xml, "default-device-name"));
}

export function parseDeviceInfo(xml) {
  return {
    name: xmlField(xml, "user-device-name") || xmlField(xml, "friendly-device-name") || xmlField(xml, "default-device-name") || "Roku",
    model: xmlField(xml, "friendly-model-name") || xmlField(xml, "model-name"),
    isTv: xmlField(xml, "is-tv") === "true",
    powerMode: xmlField(xml, "power-mode"), // PowerOn, DisplayOff, Ready, Headless...
    supportsWake: xmlField(xml, "supports-wake-on-wlan") === "true" || xmlField(xml, "supports-suspend") === "true",
  };
}

/** /query/apps -> [{ id, name, type }] */
export function parseApps(xml) {
  const out = [];
  for (const m of String(xml || "").matchAll(/<app\b([^>]*)>([\s\S]*?)<\/app>/gi)) {
    const id = attr(m[1], "id");
    if (id) out.push({ id, name: decode(m[2].trim()), type: attr(m[1], "type") });
  }
  return out;
}

/** /query/active-app + /query/media-player -> what's on */
export function parseNowPlaying(activeXml, playerXml = "") {
  const app = /<app\b([^>]*)>([\s\S]*?)<\/app>/i.exec(activeXml || "");
  const screensaver = /<screensaver\b/i.test(activeXml || "");
  const player = /<player\b([^>]*)>/i.exec(playerXml || "");
  const plugin = /<plugin\b([^>]*)\/?>/i.exec(playerXml || "");
  const ms = (tag) => {
    const v = xmlField(playerXml, tag);
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };
  const title = xmlField(playerXml, "title") || xmlField(playerXml, "name"); // only some apps and firmware report it
  return {
    app: app ? decode(app[2].trim()) : plugin ? attr(plugin[1], "name") : "",
    appId: app ? attr(app[1], "id") : "",
    home: !app || /^Roku$/i.test(decode(app?.[2]?.trim() || "")),
    screensaver,
    state: player ? attr(player[1], "state") : "", // play, pause, buffer, close, stop...
    title,
    positionMs: ms("position"),
    durationMs: ms("duration"),
  };
}

// ---- loose app names ----------------------------------------------------------------------------
const ALIASES = {
  max: ["max", "hbo max", "hbomax"],
  "prime video": ["prime video", "amazon prime video", "amazon prime", "prime", "amazon"],
  "disney plus": ["disney plus", "disney+", "disney"],
  "apple tv": ["apple tv", "apple tv+", "apple tv plus", "appletv"],
  "youtube": ["youtube"],
  "paramount plus": ["paramount plus", "paramount+", "paramount"],
  "peacock": ["peacock", "peacock tv"],
  "the roku channel": ["roku channel", "the roku channel"],
  "spotify": ["spotify", "spotify music"],
};
export const normApp = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/\+/g, " plus")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(app|the|channel|tv app)\b(?= *$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
const squash = (s) => normApp(s).replace(/\s/g, "");

/** Best installed app for a spoken name ("disney", "HBO Max", "prime"), or null. */
export function matchApp(apps, spoken) {
  const want = normApp(spoken);
  if (!want) return null;
  const candidates = [want];
  for (const [canon, list] of Object.entries(ALIASES)) if (list.some((a) => normApp(a) === want)) candidates.push(...list.map(normApp), normApp(canon));
  const score = (app) => {
    const n = normApp(app.name);
    const sq = squash(app.name);
    let best = 0;
    for (const c of candidates) {
      if (n === c || sq === c.replace(/\s/g, "")) best = Math.max(best, 100 - (c === want ? 0 : 5));
      else if (n.startsWith(`${c} `)) best = Math.max(best, 80 - n.length / 100); // "netflix" ~ "netflix kids"? shorter wins
      else if (new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(n)) best = Math.max(best, 60 - n.length / 100);
      else if (c.length >= 4 && sq.includes(c.replace(/\s/g, ""))) best = Math.max(best, 40);
    }
    return best;
  };
  let top = null;
  let topScore = 0;
  for (const app of apps) {
    if (app.type && app.type !== "appl") continue; // skip TV inputs etc. unless asked by exact name
    const s = score(app);
    if (s > topScore) [top, topScore] = [app, s];
  }
  // exact match on a TV input ("HDMI 1", "Live TV") when asked for one
  if (!top) for (const app of apps) if (normApp(app.name) === want) return app;
  return top;
}

// ---- remote buttons --------------------------------------------------------------------------------
export const KEYS = {
  home: "Home", back: "Back", up: "Up", down: "Down", left: "Left", right: "Right",
  select: "Select", ok: "Select", enter: "Enter",
  play: "Play", pause: "Play", "play pause": "Play", playpause: "Play",
  rewind: "Rev", rev: "Rev", "fast forward": "Fwd", forward: "Fwd", fwd: "Fwd",
  replay: "InstantReplay", "instant replay": "InstantReplay", info: "Info", options: "Info", star: "Info",
  search: "Search", backspace: "Backspace",
  "volume up": "VolumeUp", "volume down": "VolumeDown", mute: "VolumeMute",
  power: "Power", "power on": "PowerOn", "power off": "PowerOff",
  "channel up": "ChannelUp", "channel down": "ChannelDown", "input hdmi1": "InputHDMI1", "input hdmi2": "InputHDMI2", "input hdmi3": "InputHDMI3", "input tuner": "InputTuner",
};
export function keyFor(name) {
  const k = String(name || "").toLowerCase().replace(/[_/-]+/g, " ").replace(/\s+/g, " ").trim();
  return KEYS[k] || KEYS[k.replace(/\s/g, "")] || null;
}

// ---- SSDP discovery -------------------------------------------------------------------------------
const SEARCH = 'M-SEARCH * HTTP/1.1\r\nHost: 239.255.255.250:1900\r\nMan: "ssdp:discover"\r\nST: roku:ecp\r\nMX: 2\r\n\r\n';

/** Parse an SSDP reply. Only a Roku ECP answer whose LOCATION is the sender's own private address counts. */
export function parseSsdp(text, fromAddress) {
  const headers = {};
  for (const line of String(text).split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  if (!/roku:ecp/i.test(headers.st || "") && !/roku/i.test(headers.server || "")) return null;
  let loc;
  try {
    loc = new URL(headers.location || "");
  } catch {
    return null;
  }
  if (loc.protocol !== "http:" || Number(loc.port) !== ECP_PORT) return null;
  if (!isLocalAddress(loc.hostname) || (fromAddress && loc.hostname !== fromAddress)) return null;
  return { ip: loc.hostname, usn: headers.usn || "" };
}

/** Ask the network "any Roku here?" and collect answers for ~2.5 s. */
export function ssdpDiscover({ timeoutMs = TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const found = new Map();
    let sock;
    try {
      sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    } catch {
      resolve([]);
      return;
    }
    const finish = () => {
      try {
        sock.close();
      } catch {
        /* closed */
      }
      resolve([...found.values()]);
    };
    sock.on("error", finish);
    sock.on("message", (msg, rinfo) => {
      const r = parseSsdp(msg.toString("utf8"), rinfo.address);
      if (r) found.set(r.ip, r);
    });
    sock.bind(0, () => {
      const msg = Buffer.from(SEARCH);
      sock.send(msg, 1900, "239.255.255.250", () => {});
      setTimeout(() => sock.send(msg, 1900, "239.255.255.250", () => {}), 400); // UDP can drop: ask twice
    });
    setTimeout(finish, timeoutMs);
  });
}

// ---- the client ----------------------------------------------------------------------------------
export class RokuError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // "unreachable" | "forbidden" | "not-roku" | "bad-address" | "http"
  }
}

const CACHE_FILE = () => path.join(process.env.JERICHO_DATA_DIR || path.join(ROOT, "data"), "roku.json");

export class Roku {
  constructor({ fetchFn = (...a) => fetch(...a), discover = ssdpDiscover, env = process.env, cacheFile = CACHE_FILE(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    this.fetch = fetchFn;
    this.discover = discover;
    this.env = env;
    this.cacheFile = cacheFile;
    this.sleep = sleep;
    this.ip = null;
    this.source = null; // "ROKU_IP" | "cache" | "discovered"
    this.info = null;
  }

  readCache() {
    try {
      const c = JSON.parse(fs.readFileSync(this.cacheFile, "utf8"));
      return isLocalAddress(c.ip) ? c : null;
    } catch {
      return null;
    }
  }
  writeCache(ip, info) {
    try {
      fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
      fs.writeFileSync(this.cacheFile, JSON.stringify({ ip, name: info?.name || "", model: info?.model || "", at: new Date().toISOString() }, null, 2));
    } catch {
      /* best effort */
    }
  }

  /** One HTTP request to the TV, with a hard timeout. Never follows redirects. */
  async raw(ip, pathname, method = "GET") {
    if (!isLocalAddress(ip)) throw new RokuError("bad-address", "Only devices on the home network are allowed.");
    let res;
    try {
      res = await this.fetch(`http://${ip}:${ECP_PORT}${pathname}`, { method, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "content-length": "0" } });
    } catch {
      throw new RokuError("unreachable", NOT_REACHABLE);
    }
    if (res.status === 403) throw new RokuError("forbidden", ACCESS_DENIED);
    const text = await res.text().catch(() => "");
    return { status: res.status, ok: res.ok, text, server: res.headers?.get?.("server") || "" };
  }

  /** Check that an address is a Roku; returns its device info. */
  async verify(ip) {
    const r = await this.raw(ip, "/query/device-info");
    if (!r.ok || !looksLikeRoku(r.text, r.server)) throw new RokuError("not-roku", "That device isn't a Roku.");
    return parseDeviceInfo(r.text);
  }

  /** Where the TV is: ROKU_IP, else the cached address (if it still answers), else discovery. */
  async locate({ fresh = false } = {}) {
    const fixed = String(this.env.ROKU_IP || "").trim();
    if (fixed) {
      if (!isLocalAddress(fixed)) throw new RokuError("bad-address", "ROKU_IP in .env must be a home-network address like 192.168.1.50.");
      if (this.ip !== fixed || fresh || !this.info) {
        this.info = await this.verify(fixed);
        [this.ip, this.source] = [fixed, "ROKU_IP"];
      }
      return this.ip;
    }
    if (this.ip && !fresh) return this.ip;
    const cached = fresh ? null : this.readCache();
    if (cached) {
      try {
        this.info = await this.verify(cached.ip);
        [this.ip, this.source] = [cached.ip, "cache"];
        return this.ip;
      } catch (err) {
        if (err.code === "forbidden") throw err;
        /* moved or off: look again */
      }
    }
    const answers = await this.discover({ timeoutMs: TIMEOUT_MS });
    for (const a of answers) {
      try {
        this.info = await this.verify(a.ip);
        [this.ip, this.source] = [a.ip, "discovered"];
        this.writeCache(a.ip, this.info);
        return this.ip;
      } catch (err) {
        if (err.code === "forbidden") throw err;
      }
    }
    this.ip = null;
    throw new RokuError("unreachable", NOT_REACHABLE);
  }

  /** A request to the TV; if a cached address stopped answering, find the TV again once. */
  async call(pathname, method = "GET") {
    const ip = await this.locate();
    try {
      return await this.raw(ip, pathname, method);
    } catch (err) {
      if (err.code !== "unreachable" || this.source === "ROKU_IP") throw err;
      this.ip = null;
      const again = await this.locate({ fresh: true });
      return this.raw(again, pathname, method);
    }
  }

  async keypress(key) {
    const r = await this.call(`/keypress/${encodeURIComponent(key)}`, "POST");
    if (!r.ok) throw new RokuError("http", `The TV didn't accept ${key} (${r.status}).`);
    return true;
  }

  async deviceInfo() {
    const r = await this.call("/query/device-info");
    return parseDeviceInfo(r.text);
  }

  async apps() {
    const r = await this.call("/query/apps");
    return parseApps(r.text);
  }

  async launch(id) {
    const r = await this.call(`/launch/${encodeURIComponent(id)}`, "POST");
    if (!r.ok) throw new RokuError("http", `The TV couldn't open that app (${r.status}).`);
  }

  async nowPlaying() {
    const active = await this.call("/query/active-app");
    const player = await this.call("/query/media-player").catch(() => ({ text: "" }));
    return parseNowPlaying(active.text, player.text);
  }

  /** ECP search (opens Roku search for the words, in one app if given). Returns false if unsupported. */
  async search(keyword, providerId = "") {
    const q = new URLSearchParams({ keyword, ...(providerId ? { "provider-id": providerId, launch: "true" } : {}) });
    const r = await this.call(`/search/browse?${q}`, "POST");
    return r.ok;
  }

  /** Type text into the box that's focused on screen, one character at a time. */
  async type(text) {
    for (const ch of String(text).slice(0, 100)) {
      await this.keypress(`Lit_${ch}`);
      await this.sleep(40);
    }
  }
}
