// The two LG webOS TVs by room. Offline: the network side (scan, ARP, Wake-on-LAN, connect) is
// faked, and one test talks real SSAP to a tiny fake TV on 127.0.0.1 (a random free port,
// closed at the end). No real TVs, no kill calls, no timers left behind.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import { fakeClient, use, say } from "./fake-client.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-lg-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log") }));
Object.assign(process.env, { JERICHO_SETTINGS: path.join(tmp, "settings.json"), JERICHO_DATA_DIR: path.join(tmp, "data") });

const lg = await import("../server/lg/index.js");
const { matchLg, _clearPendingForTests } = await import("../server/lg/voice.js");
const { connectSsap, _allowLoopbackForTests, LgError } = await import("../server/lg/ssap.js");
const { magicPacket, parseArp, scanSubnets, localSubnets } = await import("../server/lg/net.js");
const { startPairing } = await import("../server/tools/lg.js");
const { matchQuick, runQuick } = await import("../server/quick.js");
const { tools, isRisky } = await import("../server/tools/index.js");
const { Brain, _resetFastModelForTests } = await import("../server/brain.js");

const keysFile = path.join(tmp, "data", "lg-keys.json");
const LIVING_MAC = "a4:36:c7:00:00:01";
const BLUE_MAC = "a4:36:c7:00:00:02";
const log = () => (fs.existsSync(path.join(tmp, "actions.log")) ? fs.readFileSync(path.join(tmp, "actions.log"), "utf8") : "");
const writeKeys = (k) => (fs.mkdirSync(path.dirname(keysFile), { recursive: true }), fs.writeFileSync(keysFile, JSON.stringify(k)));

/** A fake TV network: which TVs are on (ip -> mac), what each TV was asked, prompts shown. */
function fakeNet({ on = {}, accept = () => true } = {}) {
  const net = { on, sent: [], prompts: [], wol: [], tried: [] };
  lg._setLgDepsForTests({
    scan: async () => Object.keys(net.on).sort(),
    arp: async () => ({ ...net.on }),
    wol: async (mac, opts) => net.wol.push([mac, opts.ip]),
    connect: async (ip, { clientKey, onPrompt }) => {
      net.tried.push(ip);
      if (!net.on[ip]) throw new LgError("The TV didn't answer.", "unreachable");
      if (!clientKey) {
        net.prompts.push(ip);
        onPrompt();
        if (!accept(ip)) throw new LgError("Nobody accepted the pairing prompt in time.", "prompt-timeout");
      }
      const key = clientKey || `key-for-${net.on[ip]}`;
      return {
        clientKey: key,
        async request(uri, payload = {}) {
          net.sent.push([ip, uri, payload]);
          if (uri.endsWith("getVolume")) return { volume: 10 };
          if (uri.endsWith("listApps")) return { apps: [{ id: "netflix", title: "Netflix" }, { id: "youtube.leanback.v4", title: "YouTube" }] };
          return { returnValue: true };
        },
        close() {},
      };
    },
  });
  return net;
}

beforeEach(() => {
  fs.rmSync(keysFile, { force: true });
  _clearPendingForTests();
});
after(() => {
  _allowLoopbackForTests(false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("rooms and aliases: living room and blue room, plus 'all the TVs'", () => {
  for (const [t, room] of [
    ["turn off the living room TV", "living room"],
    ["the living room", "living room"],
    ["blue room tv volume up", "blue room"],
    ["put netflix on in the blue room", "blue room"],
    ["turn off all the TVs", "all"],
    ["turn off both TVs", "all"],
    ["turn off the TV", null],
  ]) {
    assert.equal(lg.findRoom(t), room, t);
  }
  assert.deepEqual(base.lg.rooms.map((r) => r.name), ["living room", "blue room"]);
  assert.ok(!JSON.stringify(base).includes('"LG"'), "the single 'LG' name is gone");
});

test("spoken commands by room are handled locally", () => {
  writeKeys({ rooms: { "living room": { ip: "192.168.4.48", mac: LIVING_MAC, clientKey: "k1" }, "blue room": { ip: "192.168.4.217", mac: BLUE_MAC, clientKey: "k2" } } });
  const m = (t) => matchLg(t)?.input;
  assert.deepEqual(m("turn off the blue room"), { action: "power_off", room: "blue room" });
  assert.deepEqual(m("Jericho, volume 15 in the living room"), { action: "volume_set", volume: 15, room: "living room" });
  assert.deepEqual(m("put Netflix on in the blue room"), { action: "open_app", app: "netflix", room: "blue room" });
  assert.deepEqual(m("turn the blue room TV off"), { action: "power_off", room: "blue room" });
  assert.deepEqual(m("switch the living room to HDMI 2"), { action: "input", input: "HDMI 2", room: "living room" });
  assert.deepEqual(m("pair the living room TV"), { action: "pair", room: "living room" });
  assert.deepEqual(matchLg("turn off all the TVs"), { kind: "lg", input: { action: "power_off", room: "all" }, roku: false });
  assert.equal(matchLg("turn off all the TVs and the Roku").roku, true);
  assert.equal(matchLg("turn off the living room lights"), null, "lights aren't the TV");
  assert.equal(matchLg("turn on the Roku"), null, "the Roku keeps its own commands");
});

test("no room named: the last room used; unclear: 'Living room or blue room?', and a bare room answers it", () => {
  writeKeys({ rooms: { "living room": { ip: "192.168.4.48", mac: LIVING_MAC, clientKey: "k1" }, "blue room": { ip: "192.168.4.217", mac: BLUE_MAC, clientKey: "k2" } } });
  const asked = matchLg("turn off the TV", 1000);
  assert.deepEqual(asked, { kind: "lg", ask: "Living room or blue room?" });
  assert.deepEqual(matchLg("blue room", 2000), { kind: "lg", input: { action: "power_off", room: "blue room" } });
  assert.equal(matchLg("blue room", 3000), null, "the question was answered");
  matchLg("mute the tv", 10_000);
  assert.equal(matchLg("the living room", 10_000 + 31_000), null, "an old question expires");
  writeKeys({ ...JSON.parse(fs.readFileSync(keysFile, "utf8")), lastRoom: "living room" });
  assert.deepEqual(matchLg("turn off the TV").input, { action: "power_off", room: "living room" });
  assert.deepEqual(lg.resolveRoom("the TV"), { ok: true, room: "living room", assumed: true });
});

test("before any LG is paired, 'the TV' still means the Roku", () => {
  assert.equal(matchLg("turn off the TV"), null);
  assert.deepEqual(matchQuick("turn off the TV"), { kind: "tv", input: { action: "power_off" } });
  assert.equal(matchQuick("turn off the blue room").kind, "lg", "a named room is always an LG");
});

test("pairing the first room: only one TV on, 192.168.4.217 tried first, prompt shown, IP, MAC and key saved", async () => {
  const net = fakeNet({ on: { "192.168.4.217": LIVING_MAC } });
  const prompts = [];
  const r = await lg.pairRoom("living room", { onPrompt: (ip) => prompts.push(ip) });
  assert.equal(r.ok, true);
  assert.deepEqual(prompts, ["192.168.4.217"]);
  assert.deepEqual(net.tried, ["192.168.4.217"]);
  const saved = JSON.parse(fs.readFileSync(keysFile, "utf8"));
  assert.deepEqual(saved.rooms["living room"].ip, "192.168.4.217");
  assert.equal(saved.rooms["living room"].mac, LIVING_MAC);
  assert.equal(saved.rooms["living room"].clientKey, `key-for-${LIVING_MAC}`);
  assert.equal(saved.lastRoom, "living room");
  assert.ok(net.sent.some(([, uri]) => uri.endsWith("createToast")), "the TV says which room it is");
  assert.doesNotMatch(log(), /key-for-|192\.168\.4\.217/, "no keys or addresses in the log");
});

test("pairing the first room with two TVs on stops and says to turn one off", async () => {
  fakeNet({ on: { "192.168.4.217": LIVING_MAC, "192.168.4.48": BLUE_MAC } });
  const r = await lg.pairRoom("living room");
  assert.equal(r.ok, false);
  assert.match(r.error, /turn the other TV off/);
  assert.equal(fs.existsSync(keysFile), false);
});

test("pairing the second room skips the first room's TV; a prompt nobody accepts moves on to the next candidate", async () => {
  writeKeys({ rooms: { "living room": { ip: "192.168.4.217", mac: LIVING_MAC, clientKey: "k1" } }, lastRoom: "living room" });
  const net = fakeNet({ on: { "192.168.4.217": LIVING_MAC, "192.168.4.48": BLUE_MAC, "192.168.4.90": "aa:bb:cc:dd:ee:ff" }, accept: (ip) => ip === "192.168.4.90" });
  const r = await lg.pairRoom("blue room");
  assert.equal(r.ok, true);
  assert.deepEqual(net.tried, ["192.168.4.48", "192.168.4.90"], "217 is the living room; 48 first, then the scan's others");
  assert.deepEqual(net.prompts, ["192.168.4.48", "192.168.4.90"]);
  const saved = JSON.parse(fs.readFileSync(keysFile, "utf8")).rooms;
  assert.equal(saved["blue room"].ip, "192.168.4.90");
  assert.equal(saved["living room"].clientKey, "k1", "the other room is untouched");
});

test("commands go to the right room's TV, and the last room is remembered", async () => {
  writeKeys({ rooms: { "living room": { ip: "192.168.4.217", mac: LIVING_MAC, clientKey: `key-for-${LIVING_MAC}` }, "blue room": { ip: "192.168.4.48", mac: BLUE_MAC, clientKey: `key-for-${BLUE_MAC}` } } });
  const net = fakeNet({ on: { "192.168.4.217": LIVING_MAC, "192.168.4.48": BLUE_MAC } });
  assert.equal((await lg.lgCommand("blue room", "power_off")).say, "Blue room TV off.");
  assert.deepEqual(net.sent.at(-1), ["192.168.4.48", "ssap://system/turnOff", {}]);
  assert.equal((await lg.lgCommand("living room", "volume_set", { volume: 15 })).say, "Living room volume 15.");
  assert.deepEqual(net.sent.at(-1), ["192.168.4.217", "ssap://audio/setVolume", { volume: 15 }]);
  assert.equal((await lg.lgCommand("living room", "volume_up")).say, "Living room volume 15.", "10 plus the 5 step");
  const app = await lg.lgCommand("blue room", "open_app", { app: "netflix" });
  assert.equal(app.say, "Netflix on the blue room TV.");
  assert.deepEqual(net.sent.at(-1), ["192.168.4.48", "ssap://system.launcher/launch", { id: "netflix" }]);
  assert.equal(JSON.parse(fs.readFileSync(keysFile, "utf8")).lastRoom, "blue room");
  assert.equal(net.prompts.length, 0, "a saved key never shows a prompt");
});

test("turn off all the TVs: both LGs, and the Roku only if they say so", async () => {
  writeKeys({ rooms: { "living room": { ip: "192.168.4.217", mac: LIVING_MAC, clientKey: "a" }, "blue room": { ip: "192.168.4.48", mac: BLUE_MAC, clientKey: "b" } } });
  const net = fakeNet({ on: { "192.168.4.217": LIVING_MAC, "192.168.4.48": BLUE_MAC } });
  let rokuCalls = 0;
  const fakeTools = new Map([...tools, ["tv", { run: async () => (rokuCalls++, { ok: true, said: "Turning the TV off." }) }]]);
  const r = await runQuick(matchQuick("turn off all the TVs"), { tools: fakeTools });
  assert.equal(r.say, "Living room and Blue room off.");
  assert.deepEqual(net.sent.filter(([, uri]) => uri.endsWith("turnOff")).map(([ip]) => ip).sort(), ["192.168.4.217", "192.168.4.48"]);
  assert.equal(rokuCalls, 0);
  await runQuick(matchQuick("turn off all the TVs and the Roku"), { tools: fakeTools });
  assert.equal(rokuCalls, 1);
});

test("a TV with a new IP is found again by its MAC; turning on is Wake-on-LAN to that MAC", async () => {
  writeKeys({ rooms: { "blue room": { ip: "192.168.4.48", mac: BLUE_MAC, clientKey: `key-for-${BLUE_MAC}` } } });
  const net = fakeNet({ on: { "192.168.4.77": BLUE_MAC, "192.168.4.217": LIVING_MAC } });
  const r = await lg.lgCommand("blue room", "mute");
  assert.equal(r.ok, true);
  assert.deepEqual(net.sent.at(-1), ["192.168.4.77", "ssap://audio/setMute", { mute: true }]);
  assert.equal(JSON.parse(fs.readFileSync(keysFile, "utf8")).rooms["blue room"].ip, "192.168.4.77");
  assert.match(log(), /"type":"lg_rediscovered","room":"blue room"/);
  const on = await lg.lgCommand("blue room", "power_on");
  assert.equal(on.say, "Turning on the blue room TV.");
  assert.deepEqual(net.wol, [[BLUE_MAC, "192.168.4.77"]]);
  const off = fakeNet({ on: {} });
  const gone = await lg.lgCommand("blue room", "volume_up");
  assert.match(gone.error, /isn't answering/);
  assert.equal(off.prompts.length, 0);
  assert.match((await lg.lgCommand("living room", "power_off")).error, /isn't paired yet\. Say "pair the living room TV"/);
});

test("network helpers: ARP tables from Windows, macOS and Linux, the magic packet, and the scan", async () => {
  const arp = parseArp(["  192.168.4.217         a4-36-c7-12-34-56     dynamic", "? (192.168.4.48) at a4:36:c7:1:2:3 on en0 ifscope [ethernet]", "192.168.4.1 0x1 0x2 10:20:30:40:50:60 * wlan0", "192.168.4.255 ff-ff-ff-ff-ff-ff static"].join("\n"));
  assert.deepEqual(arp, { "192.168.4.217": "a4:36:c7:12:34:56", "192.168.4.48": "a4:36:c7:01:02:03", "192.168.4.1": "10:20:30:40:50:60" });
  const p = magicPacket("A4-36-C7-12-34-56");
  assert.equal(p.length, 102);
  assert.ok(p.subarray(0, 6).every((b) => b === 0xff));
  assert.equal(p.subarray(6, 12).toString("hex"), "a436c7123456");
  assert.throws(() => magicPacket("nope"));
  const found = await scanSubnets(3001, { subnets: ["192.168.4"], probe: async (ip) => ip === "192.168.4.48" || ip === "192.168.4.217" });
  assert.deepEqual(found, ["192.168.4.48", "192.168.4.217"]);
  assert.deepEqual(localSubnets({ eth0: [{ family: "IPv4", address: "192.168.4.20", internal: false }], lo: [{ family: "IPv4", address: "127.0.0.1", internal: true }], vpn: [{ family: "IPv4", address: "8.8.8.8", internal: false }] }), ["192.168.4"]);
});

test("voice pairing runs in the background and announces the prompt and the result", async () => {
  fakeNet({ on: { "192.168.4.48": LIVING_MAC } });
  const said = [];
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  const r = startPairing("living room", { announce: (t) => (said.push(t), /paired|couldn't|declined/.test(t) && resolveDone()) });
  assert.match(r.say, /^Looking for the living room TV\. A pairing prompt will pop up on it in a moment: accept it with the TV's remote\.$/);
  await done;
  assert.deepEqual(said, ["There's a pairing prompt on the TV now. Press Accept with its remote.", "The living room TV is paired."]);
});

test("through Jericho: lg_tv is everyday (no yes), the small model has it, and an unclear room is a question", async () => {
  _resetFastModelForTests();
  assert.equal(isRisky("lg_tv", { action: "power_off" }), false);
  writeKeys({ rooms: { "living room": { ip: "192.168.4.217", mac: LIVING_MAC, clientKey: "a" }, "blue room": { ip: "192.168.4.48", mac: BLUE_MAC, clientKey: "b" } } });
  fakeNet({ on: { "192.168.4.217": LIVING_MAC, "192.168.4.48": BLUE_MAC } });
  const client = fakeClient([(req) => (assert.ok(req.tools.some((t) => t.name === "lg_tv")), use("l1", "lg_tv", { action: "open_app", app: "YouTube" })), say("Which room?")]);
  await new Brain({ client }).handle("lg1", "could you get youtube going on the tv");
  const result = JSON.parse(client.calls[1].messages.at(-1).content[0].content);
  assert.deepEqual(result, { ok: false, ask: "Living room or blue room?" });
  const local = fakeClient([]);
  const r = await new Brain({ client: local }).handle("lg2", "turn off the blue room");
  assert.equal(r.reply, "Blue room TV off.");
  assert.equal(local.calls.length, 0, "no Claude call");
});

test("real SSAP to a fake TV: the prompt, the key, then commands with the key and no prompt", async () => {
  _allowLoopbackForTests(true);
  const seen = [];
  const sockets = new Set();
  const server = http.createServer((req, res) => res.writeHead(404).end());
  server.on("upgrade", (req, socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    const accept = crypto.createHash("sha1").update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const send = (obj) => {
      const body = Buffer.from(JSON.stringify(obj));
      const head = body.length < 126 ? Buffer.from([0x81, body.length]) : Buffer.from([0x81, 126, body.length >> 8, body.length & 255]);
      socket.write(Buffer.concat([head, body]));
    };
    let buf = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 2) {
        const op = buf[0] & 0x0f;
        let len = buf[1] & 0x7f;
        let off = 2;
        if (len === 126) {
          if (buf.length < 4) return;
          len = buf.readUInt16BE(2);
          off = 4;
        }
        if (buf.length < off + 4 + len) return;
        const mask = buf.subarray(off, off + 4);
        const data = Buffer.from(buf.subarray(off + 4, off + 4 + len).map((b, i) => b ^ mask[i % 4]));
        buf = buf.subarray(off + 4 + len);
        if (op === 8) return socket.end();
        if (op !== 1) continue;
        const msg = JSON.parse(data.toString("utf8"));
        seen.push(msg.type === "register" ? { type: "register", key: msg.payload["client-key"] || null } : { type: msg.type, uri: msg.uri });
        if (msg.type === "register") {
          if (msg.payload["client-key"] === "saved-key") send({ type: "registered", id: msg.id, payload: { "client-key": "saved-key" } });
          else {
            send({ type: "response", id: msg.id, payload: { pairingType: "PROMPT", returnValue: true } });
            setImmediate(() => send({ type: "registered", id: msg.id, payload: { "client-key": "new-key" } })); // "accepted"
          }
        } else send({ type: "response", id: msg.id, payload: { returnValue: true, volume: 22 } });
      }
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    let prompted = 0;
    const tv = await connectSsap("127.0.0.1", { ports: [port], onPrompt: () => prompted++ });
    assert.equal(prompted, 1);
    assert.equal(tv.clientKey, "new-key");
    assert.equal((await tv.request("ssap://audio/getVolume")).volume, 22);
    tv.close();
    const again = await connectSsap("127.0.0.1", { ports: [port], clientKey: "saved-key", onPrompt: () => prompted++ });
    assert.equal(prompted, 1, "no prompt with a saved key");
    await again.request("ssap://system/turnOff");
    again.close();
    assert.deepEqual(seen, [{ type: "register", key: null }, { type: "request", uri: "ssap://audio/getVolume" }, { type: "register", key: "saved-key" }, { type: "request", uri: "ssap://system/turnOff" }]);
    await assert.rejects(connectSsap("8.8.8.8"), /home-network/);
  } finally {
    for (const s of sockets) s.destroy();
    await new Promise((r) => server.close(r));
    _allowLoopbackForTests(false);
  }
});
