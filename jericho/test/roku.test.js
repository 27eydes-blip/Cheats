// Roku TV over ECP, against a fake TV: discovery and the safety checks, power, volume, buttons,
// apps, search, what's playing, and the plain-English errors.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-roku-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log") }));
process.env.JERICHO_SETTINGS = path.join(tmp, "settings.json");
process.env.JERICHO_DATA_DIR = path.join(tmp, "data");

const E = await import("../server/roku/ecp.js");
const { runTv } = await import("../server/tools/tv.js");
const { tools } = await import("../server/tools/index.js");

const DEVICE = (power = "PowerOn") =>
  `<?xml version="1.0"?><device-info><udn>x</udn><vendor-name>TCL</vendor-name><model-name>7105X</model-name><friendly-model-name>TCL•Roku TV</friendly-model-name><user-device-name>Living Room TV</user-device-name><is-tv>true</is-tv><power-mode>${power}</power-mode></device-info>`;
const APPS = `<apps><app id="tvinput.hdmi1" type="tvin" version="1.0">HDMI 1</app><app id="12" type="appl" version="5.1">Netflix</app><app id="837" type="appl" version="2.1">YouTube</app><app id="195316" type="appl" version="1">YouTube TV</app><app id="2285" type="appl" version="7">Hulu</app><app id="291097" type="appl" version="1">Disney Plus</app><app id="61322" type="appl" version="1">Max</app><app id="13" type="appl" version="1">Prime Video</app><app id="22297" type="appl" version="1">Spotify Music</app><app id="151908" type="appl" version="1">The Roku Channel</app></apps>`;

/** A fake TV at `ip` (or none), recording every request. */
function fakeTv({ ip = "192.168.1.50", power = "PowerOn", status = {}, server = "Roku/12.5.0 UPnP/1.0", searchOk = true, activeXml, playerXml } = {}) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    const u = new URL(url);
    calls.push(`${init.method || "GET"} ${u.pathname}${u.search}`);
    assert.ok(init.signal, "every request has a timeout");
    assert.equal(init.redirect, "manual");
    if (ip && u.hostname !== ip) throw new TypeError("fetch failed");
    const st = status[u.pathname] ?? status["*"];
    const res = (body, code = 200) => new Response(body, { status: code, headers: { server } });
    if (st) return res("", st);
    if (u.pathname === "/query/device-info") return res(DEVICE(power));
    if (u.pathname === "/query/apps") return res(APPS);
    if (u.pathname === "/query/active-app") return res(activeXml ?? `<active-app><app id="12" type="appl">Netflix</app></active-app>`);
    if (u.pathname === "/query/media-player") return res(playerXml ?? `<player error="false" state="play"><plugin id="12" bandwidth="1" name="Netflix"/><position>754000 ms</position><duration>3120000 ms</duration></player>`);
    if (u.pathname.startsWith("/search/browse")) return res("", searchOk ? 200 : 404);
    if (u.pathname.startsWith("/keypress/") || u.pathname.startsWith("/launch/")) {
      if (u.pathname === "/keypress/PowerOn" && status.noPowerOn) return res("", 404);
      return res("");
    }
    return res("", 404);
  };
  return { calls, fetchFn };
}
const roku = (opts = {}, rokuOpts = {}) => {
  const tv = fakeTv(opts);
  const r = new E.Roku({ fetchFn: tv.fetchFn, discover: async () => [{ ip: opts.ip ?? "192.168.1.50" }], env: {}, cacheFile: path.join(tmp, `cache-${Math.random()}.json`), sleep: async () => {}, ...rokuOpts });
  return { r, calls: tv.calls };
};

test("only home-network addresses, and only devices that say they're a Roku", () => {
  for (const ip of ["192.168.1.50", "10.0.0.7", "172.16.4.2", "172.31.255.1", "169.254.3.3"]) assert.equal(E.isLocalAddress(ip), true, ip);
  for (const ip of ["8.8.8.8", "172.32.0.1", "127.0.0.1", "192.168.1.255", "0.0.0.0", "192.168.1", "fe80::1", "roku.local", "192.168.1.50:80"]) assert.equal(E.isLocalAddress(ip), false, ip);
  assert.equal(E.looksLikeRoku(DEVICE(), ""), true, "TCL•Roku TV");
  assert.equal(E.looksLikeRoku("<device-info><vendor-name>Acme</vendor-name></device-info>", "Roku/12"), true, "server header");
  assert.equal(E.looksLikeRoku("<device-info><vendor-name>Acme</vendor-name></device-info>", "nginx"), false);
  assert.equal(E.looksLikeRoku("<html>Roku fan page</html>", "Roku"), false);
  // SSDP: must be a Roku ECP answer whose location is the sender itself, on 8060
  const reply = (loc) => `HTTP/1.1 200 OK\r\nCache-Control: max-age=3600\r\nST: roku:ecp\r\nLOCATION: ${loc}\r\nUSN: uuid:roku:ecp:X\r\n\r\n`;
  assert.deepEqual(E.parseSsdp(reply("http://192.168.1.50:8060/"), "192.168.1.50"), { ip: "192.168.1.50", usn: "uuid:roku:ecp:X" });
  assert.equal(E.parseSsdp(reply("http://192.168.1.99:8060/"), "192.168.1.50"), null, "points somewhere else");
  assert.equal(E.parseSsdp(reply("http://93.184.216.34:8060/"), "93.184.216.34"), null, "not local");
  assert.equal(E.parseSsdp(reply("http://192.168.1.50:80/"), "192.168.1.50"), null, "wrong port");
  assert.equal(E.parseSsdp("HTTP/1.1 200 OK\r\nST: upnp:rootdevice\r\nLOCATION: http://192.168.1.5:8060/\r\n", "192.168.1.5"), null, "not a Roku");
});

test("discovery, caching, rediscovery when the cached address stops answering, and ROKU_IP override", async () => {
  const cacheFile = path.join(tmp, "cache.json");
  let where = "192.168.1.50";
  const tv = fakeTv({ ip: null }); // answers wherever it "is" (see `where`)
  const fetchFn = (url, init) => (new URL(url).hostname === where ? tv.fetchFn(url, init) : Promise.reject(new TypeError("fetch failed")));
  let discoveries = 0;
  const r = new E.Roku({ fetchFn, discover: async () => (discoveries++, [{ ip: where }]), env: {}, cacheFile, sleep: async () => {} });
  await r.keypress("Home");
  assert.equal(r.source, "discovered");
  assert.equal(JSON.parse(fs.readFileSync(cacheFile, "utf8")).ip, "192.168.1.50", "cached in data/roku.json");
  // a new run reads the cache instead of discovering
  const r2 = new E.Roku({ fetchFn, discover: async () => (discoveries++, []), env: {}, cacheFile, sleep: async () => {} });
  await r2.keypress("Home");
  assert.equal(r2.source, "cache");
  assert.equal(discoveries, 1);
  // the TV got a new address: the cached one stops answering, so it's found again
  where = "192.168.1.77";
  const r3 = new E.Roku({ fetchFn, discover: async () => (discoveries++, [{ ip: where }]), env: {}, cacheFile, sleep: async () => {} });
  await r3.keypress("Home");
  assert.equal(r3.ip, "192.168.1.77");
  assert.equal(JSON.parse(fs.readFileSync(cacheFile, "utf8")).ip, "192.168.1.77");
  // ROKU_IP wins over discovery, and must be a home address
  const fixed = new E.Roku({ fetchFn, discover: async () => assert.fail("no discovery with ROKU_IP"), env: { ROKU_IP: " 192.168.1.77 " }, cacheFile, sleep: async () => {} });
  await fixed.keypress("Home");
  assert.equal(fixed.source, "ROKU_IP");
  const bad = new E.Roku({ fetchFn, env: { ROKU_IP: "8.8.8.8" }, cacheFile, sleep: async () => {} });
  await assert.rejects(bad.keypress("Home"), /home-network address/);
  // a device that isn't a Roku is never used
  const notRoku = new E.Roku({ fetchFn: async () => new Response("<html/>", { status: 200, headers: { server: "nginx" } }), discover: async () => [{ ip: "192.168.1.9" }], env: {}, cacheFile: path.join(tmp, "c2.json"), sleep: async () => {} });
  await assert.rejects(notRoku.keypress("Home"), /isn't on the network/);
});

test("power: already on, PowerOn, the Power toggle fallback, and honesty about fully-off TVs", async () => {
  let { r, calls } = roku({ power: "PowerOn" });
  assert.equal((await runTv({ action: "power_on" }, r)).said, "The TV is already on.");
  ({ r, calls } = roku({ power: "DisplayOff" }));
  assert.equal((await runTv({ action: "power_on" }, r)).ok, true);
  assert.ok(calls.includes("POST /keypress/PowerOn"));
  ({ r, calls } = roku({ power: "DisplayOff", status: { noPowerOn: true } }));
  await runTv({ action: "power_on" }, r);
  assert.ok(calls.includes("POST /keypress/Power"), "older models: the Power toggle");
  ({ r } = roku({ ip: "192.168.1.200" }, { discover: async () => [] }));
  const off = await runTv({ action: "power_on" }, r);
  assert.equal(off.ok, false);
  assert.match(off.error, /Fast TV start/);
  ({ r, calls } = roku());
  await runTv({ action: "power_off" }, r);
  assert.ok(calls.includes("POST /keypress/PowerOff"));
});

test("volume up 5, mute, and the remote buttons", async () => {
  const { r, calls } = roku();
  assert.equal((await runTv({ action: "volume_up", times: 5 }, r)).said, "Volume up 5.");
  assert.equal(calls.filter((c) => c === "POST /keypress/VolumeUp").length, 5);
  await runTv({ action: "volume_down", times: 99 }, r);
  assert.equal(calls.filter((c) => c === "POST /keypress/VolumeDown").length, 20, "capped at 20 steps");
  await runTv({ action: "mute" }, r);
  assert.ok(calls.includes("POST /keypress/VolumeMute"));
  const expect = { home: "Home", back: "Back", up: "Up", down: "Down", left: "Left", right: "Right", select: "Select", play_pause: "Play", rewind: "Rev", fast_forward: "Fwd", replay: "InstantReplay", info: "Info" };
  for (const [button, key] of Object.entries(expect)) {
    await runTv({ action: "press", button }, r);
    assert.ok(calls.includes(`POST /keypress/${key}`), button);
  }
});

test("apps: loose names, the installed list, and opening one", async () => {
  const apps = E.parseApps(APPS);
  const m = (s) => E.matchApp(apps, s)?.name ?? null;
  assert.equal(m("netflix"), "Netflix");
  assert.equal(m("YouTube"), "YouTube", "not YouTube TV");
  assert.equal(m("youtube tv"), "YouTube TV");
  assert.equal(m("Disney+"), "Disney Plus");
  assert.equal(m("disney"), "Disney Plus");
  assert.equal(m("HBO Max"), "Max");
  assert.equal(m("max"), "Max");
  assert.equal(m("prime"), "Prime Video");
  assert.equal(m("Amazon Prime Video"), "Prime Video");
  assert.equal(m("spotify"), "Spotify Music");
  assert.equal(m("roku channel"), "The Roku Channel");
  assert.equal(m("hdmi 1"), "HDMI 1", "inputs by exact name");
  assert.equal(m("peacock"), null);
  const { r, calls } = roku();
  const list = await runTv({ action: "list_apps" }, r);
  assert.ok(list.apps.includes("Hulu") && !list.apps.includes("HDMI 1"));
  assert.equal((await runTv({ action: "open_app", app: "disney plus" }, r)).said, "Opening Disney Plus.");
  assert.ok(calls.includes("POST /launch/291097"));
  const missing = await runTv({ action: "open_app", app: "Peacock" }, r);
  assert.match(missing.error, /isn't installed/);
});

test('"search Netflix for Breaking Bad": ECP search, or typing when the TV has no search endpoint', async () => {
  let { r, calls } = roku();
  const res = await runTv({ action: "search", app: "Netflix", query: "Breaking Bad" }, r);
  assert.equal(res.said, "Searching Netflix for Breaking Bad.");
  assert.ok(calls.some((c) => c.startsWith("POST /search/browse?") && c.includes("keyword=Breaking+Bad") && c.includes("provider-id=12")));
  ({ r, calls } = roku({ searchOk: false }));
  await runTv({ action: "search", app: "Netflix", query: "Up & Go" }, r);
  assert.ok(calls.includes("POST /launch/12"));
  assert.ok(calls.includes("POST /keypress/Lit_U") && calls.includes("POST /keypress/Lit_%20") && calls.includes("POST /keypress/Lit_%26"), "each character typed, encoded");
});

test("what's playing: app, title when the TV gives one, home screen", async () => {
  let { r } = roku();
  assert.equal((await runTv({ action: "now_playing" }, r)).said, "Netflix is open, 12 min in of 52 min. The TV doesn't say the title.");
  ({ r } = roku({ playerXml: `<player state="pause"><plugin id="837" name="YouTube"/><title>Lo-fi beats</title></player>`, activeXml: `<active-app><app id="837">YouTube</app></active-app>` }));
  assert.equal((await runTv({ action: "now_playing" }, r)).said, "Lo-fi beats on YouTube (paused).");
  ({ r } = roku({ activeXml: `<active-app><app>Roku</app></active-app>`, playerXml: `<player state="close"/>` }));
  assert.equal((await runTv({ action: "now_playing" }, r)).said, "The TV is on the home screen.");
});

test("errors: not on the network, access turned off (403), and every action logged", async () => {
  let { r } = roku({ ip: "192.168.1.200" }, { discover: async () => [] });
  const off = await runTv({ action: "volume_up" }, r);
  assert.equal(off.error, "The TV isn't on the network. Check that it's on and on the same Wi-Fi as this PC.");
  ({ r } = roku({ status: { "/keypress/Home": 403 } }));
  const denied = await runTv({ action: "press", button: "home" }, r);
  assert.match(denied.error, /Control by mobile apps > Network access, and set it to Default or Permissive/);
  ({ r } = roku({ status: { "/query/device-info": 403 } }, { discover: async () => [{ ip: "192.168.1.50" }] }));
  assert.match((await runTv({ action: "mute" }, r)).error, /Network access/);
  await runTv({ action: "search", query: "my secret show", app: "netflix" }, roku().r);
  const log = fs.readFileSync(path.join(tmp, "actions.log"), "utf8");
  const tvLines = log.split("\n").filter((l) => l.includes('"type":"tv_action"'));
  assert.ok(tvLines.length >= 4);
  assert.doesNotMatch(log, /my secret show/, "search words are logged only as their length");
  assert.ok(tools.has("tv"));
});

test("the TV never hangs: a stalled TV times out", async () => {
  // a fetch that only ends when its timeout signal fires
  const stall = (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("timeout"))));
  const r = new E.Roku({ fetchFn: stall, discover: async () => [], env: { ROKU_IP: "192.168.1.50" }, cacheFile: path.join(tmp, "c3.json"), sleep: async () => {} });
  const keepAlive = setTimeout(() => {}, 10_000); // (the server always has other work; a bare test doesn't)
  const t0 = Date.now();
  const res = await runTv({ action: "mute" }, r);
  clearTimeout(keepAlive);
  assert.equal(res.ok, false);
  assert.ok(Date.now() - t0 < E.TIMEOUT_MS + 1500, `gave up after ${Date.now() - t0} ms`);
});
