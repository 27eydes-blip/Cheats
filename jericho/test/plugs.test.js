// Tapo smart plugs. The Tapo library is mocked (no real plugs or network), except one check that
// the real library loads with the current axios and fails cleanly against a fake device on
// 127.0.0.1 (a random free port, closed at the end). Credentials here are fake test values.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { after, beforeEach, test } from "node:test";
import { fakeClient, say, use } from "./fake-client.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-plugs-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log") }));
const EMAIL = "plug-tester@example.com";
const PASSWORD = "not-a-real-tapo-password-123";
Object.assign(process.env, { JERICHO_SETTINGS: path.join(tmp, "settings.json"), JERICHO_DATA_DIR: path.join(tmp, "data"), JERICHO_NO_ENV_FILE: "1", TAPO_EMAIL: EMAIL, TAPO_PASSWORD: PASSWORD });

const plugs = await import("../server/plugs/index.js");
const { matchPlug } = await import("../server/plugs/voice.js");
const { runPlugCommand } = await import("../server/tools/plugs.js");
const { testPlugs, formatResults } = await import("../server/selftest.js");
const { cleanEnv } = await import("../server/tools/pc.js");
const { tools, isRisky } = await import("../server/tools/index.js");
const { Brain, _resetFastModelForTests } = await import("../server/brain.js");

const FAN_MAC = "e4:fa:c4:00:00:01";
const LAMP_MAC = "84:d8:1b:00:00:02";
const ROUTER_MAC = "10:20:30:40:50:60";
const log = () => (fs.existsSync(path.join(tmp, "actions.log")) ? fs.readFileSync(path.join(tmp, "actions.log"), "utf8") : "");

/** A fake home network: plug state by IP, which IPs were logged into, and the Tapo account's list. */
function fakeTapo({ net = { "192.168.4.10": { mac: FAN_MAC, nickname: "Fan", on: false }, "192.168.4.11": { mac: LAMP_MAC, nickname: "Lamp", on: true }, "192.168.4.1": { mac: ROUTER_MAC } }, account = true, down = [] } = {}) {
  const state = { net, logins: [], creds: [] };
  plugs._setPlugDepsForTests({
    cloudPlugs: async (email, password) => {
      state.creds.push([email, password]);
      if (!account) throw new Error("cloud unreachable");
      return Object.values(state.net).filter((d) => d.nickname).map((d) => ({ name: d.nickname, mac: d.mac, model: "P110" }));
    },
    scan: async () => Object.keys(state.net),
    arp: async () => Object.fromEntries(Object.entries(state.net).map(([ip, d]) => [ip, d.mac])),
    login: async (email, password, ip) => {
      state.logins.push(ip);
      state.creds.push([email, password]);
      const d = state.net[ip];
      if (!d?.nickname || down.includes(ip)) throw new Error(`connect ECONNREFUSED ${ip} with ${password}`); // a raw library error (never passed on)
      return {
        getDeviceInfo: async () => ({ device_on: d.on, nickname: d.nickname, mac: d.mac.replace(/:/g, "-").toUpperCase(), model: "P110" }),
        turnOn: async () => void (d.on = true),
        turnOff: async () => void (d.on = false),
      };
    },
  });
  return state;
}

beforeEach(() => {
  plugs._clearTimersForTests();
  fs.rmSync(path.join(tmp, "data"), { recursive: true, force: true });
});
after(() => {
  plugs._clearTimersForTests();
  plugs._setPlugDepsForTests(null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("names come from settings.json: Fan and Lamp with aliases, and an 'all lights' group", () => {
  assert.deepEqual(base.plugs.devices.map((d) => d.name), ["Fan", "Lamp"]);
  const cfg = plugs.plugSettings();
  assert.deepEqual(plugs.findTarget("turn off my lamp", cfg), { plug: "Lamp" });
  assert.deepEqual(plugs.findTarget("the fan", cfg), { plug: "Fan" });
  assert.deepEqual(plugs.findTarget("all lights off", cfg), { group: "lights", plugs: ["Lamp"] });
  assert.deepEqual(plugs.findTarget("turn everything off", cfg), { all: true });
  assert.equal(plugs.findTarget("turn on the lights", cfg), null, "a plain 'the lights' stays with the lights tool");
  const more = plugs.plugSettings({ plugs: { devices: [{ name: "Heater", aliases: ["space heater"] }], groups: [] } });
  assert.deepEqual(plugs.findTarget("switch on the space heater", more), { plug: "Heater" }, "more plugs can be added");
});

test("spoken commands are understood locally", () => {
  const m = (t) => matchPlug(t)?.input;
  assert.deepEqual(m("turn on the fan"), { action: "on", plug: "Fan" });
  assert.deepEqual(m("Jericho, turn the lamp on"), { action: "on", plug: "Lamp" });
  assert.deepEqual(m("toggle the lamp"), { action: "toggle", plug: "Lamp" });
  assert.deepEqual(m("turn everything off"), { action: "off", all: true });
  assert.deepEqual(m("is the fan on?"), { action: "status", plug: "Fan" });
  assert.deepEqual(m("all lights off"), { action: "off", group: "lights" });
  assert.deepEqual(m("turn off the fan in 30 minutes"), { action: "timer", plug: "Fan", then: "off", minutes: 30 });
  assert.deepEqual(m("turn the fan off in an hour and a half"), { action: "timer", plug: "Fan", then: "off", minutes: 90 });
  assert.deepEqual(m("cancel the fan timer"), { action: "cancel_timer", plug: "Fan" });
  for (const t of ["turn off the TV", "turn off the blue room", "turn off the kitchen lights", "what's the weather"]) assert.equal(matchPlug(t), null, t);
});

test("discovery: only plugs on the Tapo account are logged into (never the router), and the cache has no credentials", async () => {
  const s = fakeTapo();
  const r = await plugs.discover();
  assert.deepEqual(Object.keys(r.found).sort(), ["Fan", "Lamp"]);
  assert.equal(r.found.Fan.ip, "192.168.4.10");
  assert.equal(r.found.Lamp.on, true);
  assert.deepEqual(s.logins.sort(), ["192.168.4.10", "192.168.4.11"], "credentials never go to the router");
  const cache = fs.readFileSync(path.join(tmp, "data", "plugs.json"), "utf8");
  assert.doesNotMatch(cache, new RegExp(`${EMAIL}|${PASSWORD}`));
  assert.deepEqual(JSON.parse(cache).plugs.Fan, { ip: "192.168.4.10", mac: FAN_MAC, model: "P110" });
});

test("without the account list, only TP-Link MAC prefixes are tried", async () => {
  const s = fakeTapo({ account: false, net: { "192.168.4.10": { mac: FAN_MAC, nickname: "Fan", on: false }, "192.168.4.30": { mac: "aa:bb:cc:00:00:09", nickname: "Lamp", on: false } } });
  const r = await plugs.discover();
  assert.deepEqual(Object.keys(r.found), ["Fan"]);
  assert.deepEqual(r.missing, ["Lamp"]);
  assert.deepEqual(s.logins, ["192.168.4.10"], "an unknown device never gets the Tapo login");
});

test("on, off, toggle, status, everything off and groups; no yes needed", async () => {
  const s = fakeTapo();
  assert.equal(isRisky("plug_control", { action: "off", all: true }), false);
  assert.equal((await runPlugCommand({ action: "on", plug: "Fan" })).say, "Fan on.");
  assert.equal(s.net["192.168.4.10"].on, true);
  assert.equal((await runPlugCommand({ action: "status", plug: "fan" })).say, "The fan is on.");
  assert.equal((await runPlugCommand({ action: "toggle", plug: "Lamp" })).say, "Lamp off.");
  assert.equal(s.net["192.168.4.11"].on, false);
  await runPlugCommand({ action: "on", plug: "Lamp" });
  assert.equal((await runPlugCommand({ action: "off", group: "lights" })).say, "Lamp off.");
  assert.equal(s.net["192.168.4.10"].on, true, "the fan isn't in the lights group");
  assert.equal((await runPlugCommand({ action: "off", all: true })).say, "All 2 off.");
  assert.equal(s.net["192.168.4.10"].on, false);
  assert.match((await runPlugCommand({ action: "on", plug: "toaster" })).ask, /Which plug: fan or lamp\?/);
});

test("a plug whose IP changed is found again; an unreachable plug gets a clear tip", async () => {
  const s = fakeTapo();
  await plugs.discover();
  plugs._clearTimersForTests(); // drop the logged-in sessions
  s.net["192.168.4.20"] = s.net["192.168.4.10"];
  delete s.net["192.168.4.10"];
  const r = await plugs.plugAction("Fan", "on");
  assert.equal(r.ok, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, "data", "plugs.json"), "utf8")).plugs.Fan.ip, "192.168.4.20");
  assert.match(log(), /"type":"plug_rediscovered","plug":"Fan"/);
  plugs._clearTimersForTests();
  delete s.net["192.168.4.20"];
  const gone = await plugs.plugAction("Fan", "off");
  assert.equal(gone.ok, false);
  assert.match(gone.error, /^I can't find the fan on the network or your Tapo account\. .*same Wi-Fi as this PC \(the 2\.4 GHz network\).*Third-Party Compatibility is on in the Tapo app/);
  assert.doesNotMatch(log(), /ECONNREFUSED/, "raw library errors never reach the log");
});

test("timers: 'turn off the fan in 30 minutes' is saved, survives a restart, fires and can be cancelled", async () => {
  const s = fakeTapo();
  s.net["192.168.4.10"].on = true;
  const now = Date.now();
  assert.equal(plugs.addTimer("Fan", "off", 30, { now }).say, "Okay, the fan goes off in 30 minutes.");
  assert.equal(plugs.addTimer("Fan", "off", 90, { now }).say, "Okay, the fan goes off in 1 hour 30 minutes.", "a new timer replaces the old one");
  assert.equal(plugs.listTimers().length, 1);
  assert.equal(plugs.cancelTimers("Fan").say, "Cancelled the fan timer.");
  assert.equal(plugs.listTimers().length, 0);
  // a timer that came due while Jericho was off runs at startup
  fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "data", "plug-timers.json"), JSON.stringify([{ id: "t1", plug: "Fan", action: "off", at: now - 60_000 }]));
  const said = new Promise((resolve) => plugs.restoreTimers({ announce: resolve }));
  assert.equal(await said, "Fan off, like you asked.");
  assert.equal(s.net["192.168.4.10"].on, false);
  assert.deepEqual(plugs.listTimers(), []);
  assert.equal(plugs.addTimer("Fan", "off", 0).ok, false);
});

test("through Jericho: plain plug commands make no Claude call; others use plug_control on the small model", async () => {
  fakeTapo();
  _resetFastModelForTests();
  const none = fakeClient([]);
  const r = await new Brain({ client: none }).handle("p1", "turn off the fan in 30 minutes");
  assert.equal(r.reply, "Okay, the fan goes off in 30 minutes.");
  const r2 = await new Brain({ client: none }).handle("p2", "is the lamp on?");
  assert.equal(r2.reply, "The lamp is on.");
  assert.equal(none.calls.length, 0);
  const client = fakeClient([(req) => (assert.equal(req.model, "claude-haiku-5-5"), assert.ok(req.tools.some((t) => t.name === "plug_control")), use("c1", "plug_control", { action: "on", plug: "Fan" })), say("Fan's on.")]);
  await new Brain({ client }).handle("p3", "it's hot in here, get the fan going");
  assert.match(client.calls[1].messages.at(-1).content[0].content, /"say":"Fan on\."/);
  assert.ok(tools.has("plug_control"));
});

test("credentials: only 'set' or 'missing' is ever shown, never logged, never given to other programs", async () => {
  fakeTapo();
  await runPlugCommand({ action: "on", plug: "Fan" });
  assert.deepEqual(plugs.credStatus(), { TAPO_EMAIL: "set", TAPO_PASSWORD: "set" });
  assert.deepEqual(plugs.credStatus({}), { TAPO_EMAIL: "missing", TAPO_PASSWORD: "missing" });
  const ok = testPlugs();
  assert.equal(ok.status, "PASS");
  assert.equal(ok.reason, "TAPO_EMAIL set, TAPO_PASSWORD set (npm run plugs:test finds the plugs)");
  assert.match(formatResults({ claude: { status: "PASS", reason: "x" }, voice: { status: "PASS", reason: "x" }, calendar: { status: "SKIP", reason: "x" }, claudeCode: { status: "SKIP", reason: "x" }, plugs: testPlugs({}) }), /Plugs +➖ SKIP {2}TAPO_EMAIL missing, TAPO_PASSWORD missing/);
  const env = cleanEnv();
  assert.equal(env.TAPO_EMAIL, undefined);
  assert.equal(env.TAPO_PASSWORD, undefined);
  assert.doesNotMatch(log(), new RegExp(`${EMAIL}|${PASSWORD}`));
  const script = fs.readFileSync(new URL("../scripts/plugs-test.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(script, /process\.env\.TAPO/, "the script only prints set or missing");
  assert.equal(JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts["plugs:test"], "node scripts/plugs-test.mjs");
});

test("missing credentials: a spoken fix, no network", async () => {
  const s = fakeTapo();
  const saved = { e: process.env.TAPO_EMAIL, p: process.env.TAPO_PASSWORD };
  process.env.TAPO_EMAIL = "";
  try {
    const r = await plugs.plugAction("Fan", "on");
    assert.equal(r.error, "Tapo isn't set up yet: add TAPO_EMAIL and TAPO_PASSWORD to the .env file, then restart me.");
    assert.equal(s.logins.length, 0);
  } finally {
    process.env.TAPO_EMAIL = saved.e;
    process.env.TAPO_PASSWORD = saved.p;
  }
});

test("a wrong Tapo email or password is said plainly (and nothing private is logged)", async () => {
  fakeTapo();
  plugs._setPlugDepsForTests({ cloudPlugs: async () => [{ name: "Fan", mac: FAN_MAC }], scan: async () => ["192.168.4.10"], arp: async () => ({ "192.168.4.10": FAN_MAC }), login: async () => { throw new Error("Invalid credentials"); } });
  const r = await plugs.plugAction("Fan", "on");
  assert.equal(r.error, "The plug didn't accept the Tapo email and password in .env.");
  assert.doesNotMatch(log(), new RegExp(`${EMAIL}|${PASSWORD}`));
});

test("local login failing (your plugs) falls back to the Tapo cloud, and the log says which path", async () => {
  const s = fakeTapo();
  const cloudCalls = [];
  plugs._setPlugDepsForTests({
    cloudPlugs: async () => [{ name: "Fan", mac: FAN_MAC, model: "P110", deviceId: "dev-fan", appServerUrl: "https://example.invalid" }, { name: "Lamp", mac: LAMP_MAC, model: "P105", deviceId: "dev-lamp" }],
    scan: async () => ["192.168.4.10", "192.168.4.11"],
    arp: async () => ({ "192.168.4.10": FAN_MAC, "192.168.4.11": LAMP_MAC }),
    login: async () => {
      throw Object.assign(new Error("handshake2 answered HTTP 403"), { code: "bad-response", step: "handshake2" });
    },
    cloudDevice: (plug) => ({
      getDeviceInfo: async () => (cloudCalls.push([plug.deviceId, "info"]), { device_on: s.net["192.168.4.10"].on }),
      turnOn: async () => (cloudCalls.push([plug.deviceId, "on"]), (s.net["192.168.4.10"].on = true)),
      turnOff: async () => (cloudCalls.push([plug.deviceId, "off"]), (s.net["192.168.4.10"].on = false)),
    }),
  });
  const r = await plugs.discover();
  assert.deepEqual(r.missing, [], "on the account means found, even when local login fails");
  assert.equal(r.found.Fan.path, "cloud");
  assert.equal(r.found.Fan.localError, "handshake2: bad-response");
  plugs._clearTimersForTests();
  const on = await plugs.plugAction("Fan", "on");
  assert.equal(on.ok, true);
  assert.equal(on.path, "cloud");
  assert.ok(cloudCalls.some(([id, what]) => id === "dev-fan" && what === "on"));
  assert.match(log(), /"type":"plug_action","plug":"Fan","action":"on","ok":true,"path":"cloud"/);
  assert.match(log(), /"type":"plugs_discovered".*"cloud":2/);
});

test("npm run plugs:test -- --debug shows only safe facts", async () => {
  fakeTapo();
  plugs._setPlugDepsForTests({
    cloudPlugs: async () => [{ name: "Fan", mac: FAN_MAC, model: "P110", deviceId: "dev-fan", online: true }],
    scan: async () => ["192.168.4.10"],
    arp: async () => ({ "192.168.4.10": FAN_MAC }),
    login: async (email, password, ip, { trace }) => {
      trace.push({ step: "handshake1", status: 200, bytes: 48, cookie: "absent" }, { step: "verify", matched: "none", secret: password });
      throw Object.assign(new Error("the plug didn't accept this Tapo email and password"), { code: "auth", step: "verify" });
    },
    cloudDevice: () => ({ getDeviceInfo: async () => ({ device_on: true }), turnOn: async () => {}, turnOff: async () => {} }),
  });
  process.argv.push("--debug");
  const lines = [];
  try {
    const { main } = await import("../scripts/plugs-test.mjs");
    const probe = async () => [{ protocol: "tpap", step: "discover", status: 200, bytes: 120, errorCode: 0, result: "announced: tls 0, port 80, pake [2], dac 0, owner is this account" }, { protocol: "klap", step: "handshake1", status: 200, bytes: 49, cookie: "absent", shape: "json", errorCode: -1010, result: "not a KLAP answer (KLAP is 48 bytes)", secret: PASSWORD }];
    await main((l) => lines.push(l), { probe }); // no real network
  } finally {
    process.argv.pop();
  }
  const out = lines.join("\n");
  assert.match(out, /TAPO_EMAIL: set/);
  assert.match(out, /Tapo account: 1 plug\(s\)/);
  assert.match(out, /192\.168\.4\.10 +MAC e4:fa:c4:00:00:01 +FAILED at verify \(auth\): the plug didn't accept this Tapo email and password/);
  assert.match(out, /step=handshake1 status=200 bytes=48 cookie=absent/);
  assert.match(out, /step=verify matched=none$/m, "unknown fields (like a secret) are never printed");
  assert.match(out, /✅ Fan +ON .* via cloud \(local: verify: auth\)/);
  assert.match(out, /Protocol probe for 192\.168\.4\.10/);
  assert.match(out, /klap +handshake1 +status=200 bytes=49 cookie=absent shape=json errorCode=-1010 +-> not a KLAP answer/);
  assert.doesNotMatch(out, new RegExp(`${EMAIL}|${PASSWORD}|dev-fan`));
});

test("the real Tapo library loads with the current axios and fails cleanly against a fake device", async () => {
  const require = createRequire(import.meta.url);
  assert.match(require("axios/package.json").version, /^1\./);
  const lib = await import("tp-link-tapo-connect");
  const { loginDeviceByIp } = lib.default || lib;
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/app/handshake1")) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": "application/json", "set-cookie": "TP_SESSIONID=x" }).end(JSON.stringify({ error_code: -1010 }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const warn = console.warn;
  console.warn = () => {}; // the library's own "falling back" note
  try {
    await assert.rejects(loginDeviceByIp(EMAIL, PASSWORD, `127.0.0.1:${server.address().port}`));
  } finally {
    console.warn = warn;
    await new Promise((r) => server.close(r));
  }
});
