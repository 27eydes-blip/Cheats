// Finding the plugs: addresses from settings.json first, then a sweep that fills the ARP table
// BEFORE it's read, MACs compared normalized (Windows' hyphens vs the account's colons), and
// rediscovery by MAC when a saved address stops answering. The network is faked; fake
// credentials only. No real plugs.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, test } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-plugdisc-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log") }));
const EMAIL = "disc-tester@example.com";
const PASSWORD = "fake-disc-password-654";
Object.assign(process.env, { JERICHO_SETTINGS: path.join(tmp, "settings.json"), JERICHO_DATA_DIR: path.join(tmp, "data"), JERICHO_NO_ENV_FILE: "1", TAPO_EMAIL: EMAIL, TAPO_PASSWORD: PASSWORD });

const plugs = await import("../server/plugs/index.js");
const { normalizeMac, parseArp, pokeSubnets } = await import("../server/lg/net.js");

const LAMP_MAC = "58:d8:12:fe:48:24";
const FAN_MAC = "58:d8:12:fe:47:f0";

/**
 * A fake home network. `where`: ip -> plug. The ARP table starts EMPTY (like a PC that hasn't
 * talked to the plugs lately) and only fills once the sweep (scan + poke) has run.
 */
function fakeNet({ where = { "192.168.4.222": { name: "Lamp", mac: LAMP_MAC }, "192.168.4.223": { name: "Fan", mac: FAN_MAC } }, account = true, extra = {} } = {}) {
  const st = { where, calls: [], logins: [], swept: false, on: {} };
  const winMac = (m) => m.replace(/:/g, "-"); // how Windows' arp -a prints it
  plugs._setPlugDepsForTests({
    cloudPlugs: async () => {
      if (!account) throw Object.assign(new Error("cloud down"), { code: "unreachable" });
      return [{ name: "Lamp", mac: "58D812FE4824", model: "TP15", deviceId: "d-lamp" }, { name: "Fan", mac: "58:D8:12:FE:47:F0", model: "TP15", deviceId: "d-fan" }];
    },
    scan: async () => (st.calls.push("scan"), Object.keys(st.where)),
    poke: async () => (st.calls.push("poke"), (st.swept = true), 254),
    arp: async () => (st.calls.push("arp"), st.swept ? Object.fromEntries([...Object.entries(st.where).map(([ip, p]) => [ip, winMac(p.mac)]), ["192.168.4.1", "10-20-30-40-50-60"], ...Object.entries(extra)]) : {}),
    login: async (email, password, ip) => {
      st.logins.push(ip);
      const p = st.where[ip];
      if (!p) throw Object.assign(new Error("connection failed"), { code: "unreachable", step: "discover" });
      return { protocol: "tpap", getDeviceInfo: async () => ({ device_on: Boolean(st.on[p.name]), nickname: p.name, model: "TP15", mac: winMac(p.mac).toUpperCase() }), turnOn: async () => void (st.on[p.name] = true), turnOff: async () => void (st.on[p.name] = false) };
    },
    cloudDevice: () => ({ getDeviceInfo: async () => { throw Object.assign(new Error("offline"), { code: "offline" }); } }),
  });
  return st;
}

beforeEach(() => {
  plugs._clearTimersForTests();
  fs.rmSync(path.join(tmp, "data"), { recursive: true, force: true });
});
after(() => {
  plugs._setPlugDepsForTests(null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("MACs match however they're written: Windows hyphens, colons, bare hex, any case", () => {
  for (const m of ["58-d8-12-fe-48-24", "58:D8:12:FE:48:24", "58-D8-12-FE-48-24", "58D812FE4824", " 58d812fe4824 "]) assert.equal(normalizeMac(m), LAMP_MAC, m);
  assert.equal(normalizeMac("58D812FE48"), "", "too short");
  assert.deepEqual(parseArp("Interface: 192.168.4.20 --- 0x5\n  Internet Address      Physical Address      Type\n  192.168.4.222         58-d8-12-fe-48-24     dynamic\n  192.168.4.223         58-d8-12-fe-47-f0     dynamic\n"), { "192.168.4.222": LAMP_MAC, "192.168.4.223": FAN_MAC });
});

test("settings.json has the lamp at .222 and the fan at .223, with their MACs", () => {
  const cfg = plugs.plugSettings();
  assert.deepEqual(cfg.devices.map((d) => [d.name, d.ip, d.mac]), [["Fan", "192.168.4.223", FAN_MAC], ["Lamp", "192.168.4.222", LAMP_MAC]]);
});

test("an address from settings.json is tried first, and no scan is needed", async () => {
  const st = fakeNet();
  const r = await plugs.discover();
  assert.deepEqual(r.missing, []);
  assert.equal(r.found.Lamp.ip, "192.168.4.222");
  assert.equal(r.found.Fan.path, "local");
  assert.deepEqual(st.calls, [], "no scan, no poke, no ARP read");
  assert.deepEqual(st.logins.sort(), ["192.168.4.222", "192.168.4.223"]);
  const on = await plugs.plugAction("Lamp", "on");
  assert.equal(on.say, "Lamp on.");
});

test("without a fixed address: the sweep runs BEFORE the ARP table is read, so the plugs are in it", async () => {
  const st = fakeNet();
  const r = await plugs.discover({ cfg: plugs.plugSettings({ plugs: { devices: [{ name: "Fan" }, { name: "Lamp" }] } }) });
  assert.deepEqual(st.calls, ["scan", "poke", "arp"], "scan and poke first, then arp -a");
  assert.deepEqual(r.missing, []);
  assert.equal(r.found.Lamp.ip, "192.168.4.222", "matched the account's 58D812FE4824 to Windows' 58-d8-12-fe-48-24");
  assert.deepEqual(st.logins.sort(), ["192.168.4.222", "192.168.4.223"], "never the router");
});

test("a saved address that stops answering: found again by MAC, and the new address is remembered", async () => {
  const st = fakeNet({ where: { "192.168.4.230": { name: "Lamp", mac: LAMP_MAC }, "192.168.4.223": { name: "Fan", mac: FAN_MAC } } });
  const r = await plugs.discover();
  assert.equal(r.found.Lamp.ip, "192.168.4.230");
  assert.equal(r.found.Lamp.path, "local");
  assert.deepEqual(st.calls, ["scan", "poke", "arp"], "the sweep only ran because the lamp's address failed");
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, "data", "plugs.json"), "utf8")).plugs.Lamp.ip, "192.168.4.230");
  // later commands use the remembered address directly
  plugs._clearTimersForTests();
  st.logins.length = 0;
  assert.equal((await plugs.plugAction("Lamp", "off")).ok, true);
  assert.deepEqual(st.logins, ["192.168.4.230"]);
});

test("no account list and no MAC known: TP-Link prefixes (including the TP15's 58:d8:12), matched by name", async () => {
  const st = fakeNet({ account: false });
  const r = await plugs.discover({ cfg: plugs.plugSettings({ plugs: { devices: [{ name: "Fan" }, { name: "Lamp" }] } }) });
  assert.deepEqual(r.missing, []);
  assert.ok(!st.logins.includes("192.168.4.1"), "the router (not a TP-Link MAC) never gets the login");
});

test("--debug lists every address considered, with its MAC and why", async () => {
  fakeNet({ extra: { "192.168.4.50": "aa-bb-cc-dd-ee-ff" } });
  const r = await plugs.discover({ debug: true, cfg: plugs.plugSettings({ plugs: { devices: [{ name: "Fan", ip: "192.168.4.223" }, { name: "Lamp" }] } }) });
  const c = Object.fromEntries(r.considered.filter((x) => !x.source.startsWith("settings")).map((x) => [x.ip, x]));
  assert.ok(r.considered.some((x) => x.ip === "192.168.4.223" && x.source === "settings (Fan)" && x.match === "set in settings.json"));
  assert.equal(c["192.168.4.222"].mac, LAMP_MAC);
  assert.equal(c["192.168.4.222"].match, "MAC of Lamp");
  assert.equal(c["192.168.4.1"].match, "no", "non-matching devices are listed too");
  assert.equal(c["192.168.4.50"].mac, "aa:bb:cc:dd:ee:ff");
  const lines = [];
  process.argv.push("--debug");
  try {
    const { main } = await import("../scripts/plugs-test.mjs");
    await main((l) => lines.push(l), { probe: async () => [] });
  } finally {
    process.argv.pop();
  }
  const out = lines.join("\n");
  assert.match(out, /Addresses considered/);
  assert.match(out, /192\.168\.4\.222 +58:d8:12:fe:48:24 +settings \(Lamp\) +set in settings\.json/);
  assert.doesNotMatch(out, new RegExp(`${EMAIL}|${PASSWORD}`));
});

test("the ARP-filling poke sends one tiny datagram per address and needs no child processes", async () => {
  assert.equal(await pokeSubnets(["127.0.0"]), 254); // loopback only in the test
  assert.equal(await pokeSubnets([]), 0);
});
