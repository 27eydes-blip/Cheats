// Our KLAP client against a fake Tapo plug on 127.0.0.1 that speaks the real protocol (handshake1,
// handshake2, AES requests), in both login-hash variants, with and without a session cookie.
// Random free ports, closed at the end. Fake test credentials only. No real plugs or network.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { after, test } from "node:test";
import { authHashV1, authHashV2, klapLogin, matchProof, proofV1, proofV2 } from "../server/plugs/klap.js";

const EMAIL = "klap-tester@example.com";
const PASSWORD = "fake-klap-password-456";
const sha256 = (b) => crypto.createHash("sha256").update(b).digest();
const servers = [];
after(async () => {
  for (const s of servers) await new Promise((r) => s.close(r));
});

/** A fake plug. version 2 (Tapo) or 1 (Kasa); cookie true/false; login: the account it's bound to. */
async function fakePlug({ version = 2, cookie = true, login = [EMAIL, PASSWORD], klap = true } = {}) {
  const state = { on: false, nickname: "Fan", requests: [], seen: [] };
  const auth = version === 2 ? authHashV2(...login) : authHashV1(...login);
  let session = null;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      state.seen.push({ url: req.url.replace(/\?.*/, ""), cookie: req.headers.cookie || "" });
      if (!klap && req.url.startsWith("/app/handshake1")) return res.writeHead(404).end();
      if (req.url === "/app/handshake1") {
        const remote = crypto.randomBytes(16);
        session = { local: body, remote };
        const proof = version === 2 ? proofV2(body, remote, auth) : proofV1(body, remote, auth);
        res.writeHead(200, cookie ? { "set-cookie": "TP_SESSIONID=abc123;TIMEOUT=86400" } : {});
        return res.end(Buffer.concat([remote, proof]));
      }
      if (req.url === "/app/handshake2") {
        const want = version === 2 ? sha256(Buffer.concat([session.remote, session.local, auth])) : sha256(Buffer.concat([session.remote, auth]));
        return res.writeHead(body.equals(want) ? 200 : 403).end();
      }
      if (req.url.startsWith("/app/request")) {
        const seq = Number(new URL(req.url, "http://x").searchParams.get("seq"));
        const derive = (l) => sha256(Buffer.concat([Buffer.from(l), session.local, session.remote, auth]));
        const key = derive("lsk").subarray(0, 16);
        const sig = derive("ldk").subarray(0, 28);
        const seqBuf = Buffer.alloc(4);
        seqBuf.writeInt32BE(seq);
        const iv = Buffer.concat([derive("iv").subarray(0, 12), seqBuf]);
        const enc = body.subarray(32);
        if (!sha256(Buffer.concat([sig, seqBuf, enc])).equals(body.subarray(0, 32))) return res.writeHead(403).end();
        const d = crypto.createDecipheriv("aes-128-cbc", key, iv);
        const msg = JSON.parse(Buffer.concat([d.update(enc), d.final()]).toString());
        state.requests.push(msg.method);
        let out = { error_code: 0, result: {} };
        if (msg.method === "get_device_info") out.result = { device_on: state.on, nickname: Buffer.from(state.nickname).toString("base64"), mac: "E4-FA-C4-00-00-01", model: "P110" };
        else if (msg.method === "set_device_info") state.on = Boolean(msg.params.device_on);
        else out = { error_code: -1002 };
        const c = crypto.createCipheriv("aes-128-cbc", key, iv);
        const reply = Buffer.concat([c.update(JSON.stringify(out)), c.final()]);
        return res.writeHead(200).end(Buffer.concat([sha256(Buffer.concat([sig, seqBuf, reply])), reply]));
      }
      res.writeHead(404).end();
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return { ip: `127.0.0.1:${server.address().port}`, state };
}

const login = (ip, opts = {}) => klapLogin(ip, { email: EMAIL, password: PASSWORD, timeoutMs: 3000, allowLoopback: true, ...opts });

test("KLAP v2 (Tapo): login, read the plug, switch it on and off", async () => {
  const { ip, state } = await fakePlug({ version: 2 });
  const trace = [];
  const dev = await login(ip, { trace });
  assert.equal(dev.protocol, "klap-v2");
  const info = await dev.getDeviceInfo();
  assert.equal(info.nickname, "Fan");
  assert.equal(info.device_on, false);
  await dev.turnOn();
  assert.equal(state.on, true);
  await dev.turnOff();
  assert.equal(state.on, false);
  assert.deepEqual(state.requests, ["get_device_info", "set_device_info", "set_device_info"]);
  assert.deepEqual(trace.slice(0, 3), [{ step: "handshake1", status: 200, bytes: 48, cookie: "present" }, { step: "verify", matched: "klap-v2" }, { step: "handshake2", status: 200 }]);
  assert.ok(state.seen.filter((s) => s.url !== "/app/handshake1").every((s) => s.cookie === "TP_SESSIONID=abc123"), "the session cookie is sent back");
});

test("no session cookie (newer firmware): works, where tp-link-tapo-connect 2.0.15 crashed", async () => {
  const { ip, state } = await fakePlug({ version: 2, cookie: false });
  const trace = [];
  const dev = await login(ip, { trace });
  await dev.turnOn();
  assert.equal(state.on, true);
  assert.equal(trace[0].cookie, "absent");
  // the library's own KLAP login, against the same plug: the TypeError you saw
  const { loginDeviceByIp } = await import("tp-link-tapo-connect/dist/klap-transport.js").then((m) => m.default || m);
  await assert.rejects(loginDeviceByIp(EMAIL, PASSWORD, ip), /Cannot read properties of undefined \(reading '0'\)/);
});

test("KLAP v1 (Kasa-style hash) works too", async () => {
  const { ip, state } = await fakePlug({ version: 1 });
  const dev = await login(ip);
  assert.equal(dev.protocol, "klap-v1");
  await dev.turnOn();
  assert.equal(state.on, true);
});

test("clear failures: wrong login, a plug on another account, no KLAP, nothing there", async () => {
  const wrong = await fakePlug({ login: ["someone-else@example.com", "other-password"] });
  const trace = [];
  await assert.rejects(login(wrong.ip, { trace }), (err) => err.code === "auth" && err.step === "verify" && /didn't accept this Tapo email and password/.test(err.message));
  assert.deepEqual(trace.at(-1), { step: "verify", matched: "none" });
  const blank = await fakePlug({ login: ["", ""] });
  await assert.rejects(login(blank.ip), (err) => err.code === "auth" && err.other === "blank" && /set up with a different login \(blank\)/.test(err.message));
  const old = await fakePlug({ klap: false });
  await assert.rejects(login(old.ip), (err) => err.code === "not-klap" && err.step === "handshake1");
  const closed = http.createServer();
  await new Promise((r) => closed.listen(0, "127.0.0.1", r));
  const port = closed.address().port;
  await new Promise((r) => closed.close(r)); // nothing listens there now
  await assert.rejects(login(`127.0.0.1:${port}`), (err) => err.code === "unreachable" && err.step === "handshake1");
  await assert.rejects(klapLogin("8.8.8.8", { email: EMAIL, password: PASSWORD }), (err) => err.code === "unreachable" && err.step === "start");
});

test("the email is matched case-insensitively and trimmed, like the Tapo app", () => {
  const local = crypto.randomBytes(16);
  const remote = crypto.randomBytes(16);
  const proof = proofV2(local, remote, authHashV2(EMAIL.toLowerCase(), PASSWORD));
  assert.equal(matchProof(local, remote, proof, ` ${EMAIL} `, PASSWORD)?.version, 2, "spaces around it");
  assert.equal(matchProof(local, remote, proof, EMAIL.toUpperCase(), PASSWORD)?.version, 2);
});

test("the trace never holds credentials, seeds, keys or bodies", async () => {
  const { ip } = await fakePlug({ version: 2 });
  const trace = [];
  const dev = await login(ip, { trace });
  await dev.getDeviceInfo();
  const text = JSON.stringify(trace);
  assert.doesNotMatch(text, new RegExp(`${EMAIL}|${PASSWORD}|abc123|nickname|Fan`));
  for (const e of trace) for (const k of Object.keys(e)) assert.ok(["step", "status", "bytes", "cookie", "matched", "errorCode", "resultKeys", "decrypt"].includes(k), k);
});
