// TPAP (the newer Tapo login) against a fake plug on 127.0.0.1 that plays the device side of
// SPAKE2+, answers KLAP with a short JSON error (like a plug in TPAP mode) and refuses the older
// protocol. Also the published test vectors. Random free ports, closed at the end; fake
// credentials only. No real plugs or network.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { after, test } from "node:test";
import * as ec from "../server/plugs/p256.js";
import { credentialFor, deriveW, makeCipher, ownerMatches, proveWith, sha256Crypt, tpapDiscover, tpapLogin } from "../server/plugs/tpap.js";
import { klapLogin, klapProbe } from "../server/plugs/klap.js";
import { probeAddress, probeLine } from "../server/plugs/probe.js";

const EMAIL = "tpap-tester@example.com";
const PASSWORD = "fake-tpap-password-321";
const hex = (s) => Buffer.from(s.replace(/\s/g, ""), "hex");
const sha256 = (b) => crypto.createHash("sha256").update(b).digest();
const md5hex = (s) => crypto.createHash("md5").update(s).digest("hex");
const servers = [];
after(async () => {
  for (const s of servers) await new Promise((r) => s.close(r));
});

test("SPAKE2+ matches the RFC 9383 test vector", () => {
  const sc = (s) => ec.bigFromBytes(hex(s)) % ec.N;
  const p = proveWith(
    sc("bb8e1bbcf3c48f62c08db243652ae55d3e5586053fca77102994f23ad95491b3"),
    sc("7e945f34d78785b8a3ef44d0df5a1a97d6b3b460409a345ca7830387a74b1dba"),
    sc("d1232c8e8693d02368976c174e2088851b8365d0d79a9eee709c6a05a2fad539"),
    Buffer.from("SPAKE2+-P256-SHA256-HKDF-SHA256-HMAC-SHA256 Test Vectors"),
    hex("04c0f65da0d11927bdf5d560c69e1d7d939a05b0e88291887d679fcadea75810fb5cc1ca7494db39e82ff2f50665255d76173e09986ab46742c798a9a68437b048"),
    Buffer.from("client"),
    Buffer.from("server"),
  );
  assert.equal(p.share.toString("hex"), "04ef3bd051bf78a2234ec0df197f7828060fe9856503579bb1733009042c15c0c1de127727f418b5966afadfdd95a6e4591d171056b333dab97a79c7193e341727");
  assert.equal(p.confirm.toString("hex"), "926cc713504b9b4d76c9162ded04b5493e89109f6d89462cd33adc46fda27527");
  assert.equal(p.sharedKey.toString("hex"), "0c5f8ccd1413423a54f6c1fb26ff01534a87f893779c6e68666d772bfd91f3e7");
  assert.equal(p.expectDeviceConfirm.toString("hex"), "9747bcc4f8fe9f63defee53ac9b07876d907d55047e6ff2def2e7529089d3e68");
});

test("P-256 math agrees with node:crypto", () => {
  for (let i = 0; i < 3; i++) {
    const e = crypto.createECDH("prime256v1");
    e.generateKeys();
    assert.deepEqual(ec.encode(ec.mul(ec.G, ec.bigFromBytes(e.getPrivateKey()))), e.getPublicKey());
    assert.deepEqual(ec.encode(ec.decode(e.getPublicKey(null, "compressed"))), e.getPublicKey());
  }
  assert.equal(ec.decode(Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)])), null, "a point off the curve is refused");
});

test("the session cipher and SHA-256-crypt match known answers", () => {
  const c = makeCipher(Buffer.from(Array.from({ length: 32 }, (_, i) => i)), 0x01020304);
  const { body, seq } = c.encrypt('{"method":"get_device_info"}');
  assert.equal(body.toString("hex"), "01020304c0331c1c36a5df4ce0c68e5a27b2667ebf842dc994a3fd24b9e860a60fab76d4b66b9b669d95cca10c012f13");
  assert.equal(c.decrypt(seq, body), '{"method":"get_device_info"}');
  assert.throws(() => c.decrypt(seq + 1, body));
  assert.equal(sha256Crypt("Hello world!", "saltstring"), "$5$saltstring$5B8vYYiY.CVt1RlTTf8KbXBH3hsxY/GNooZaBBGWEc5");
  assert.equal(sha256Crypt("Hello world!", "saltstringsaltstring", 10000), "$5$rounds=10000$saltstringsaltst$3xv.VbSHBb41AL9AvLeujZkZRBAwqFMz2.opqey6IcA");
});

test("password transforms the plug can ask for", () => {
  const sha1 = (s) => crypto.createHash("sha1").update(s).digest("hex");
  assert.equal(credentialFor("pw", "a@b.c", { type: "password_shadow", params: { passwd_id: 2 } }), sha1("pw"));
  assert.equal(credentialFor("pw", "a@b.c", { type: "password_shadow", params: { passwd_id: 4 } }), "pw");
  assert.equal(credentialFor("Hello world!", "a@b.c", { type: "password_shadow", params: { passwd_id: 5, passwd_salt: "saltstring" } }), "$5$saltstring$5B8vYYiY.CVt1RlTTf8KbXBH3hsxY/GNooZaBBGWEc5");
  assert.equal(credentialFor("Hello world!", "a@b.c", { type: "password_shadow", params: { passwd_id: 5, passwd_prefix: "$5$saltstring" } }), "$5$saltstring$5B8vYYiY.CVt1RlTTf8KbXBH3hsxY/GNooZaBBGWEc5");
  assert.equal(credentialFor("pw", "a@b.c", { type: "password_shadow", params: { passwd_id: 3 } }, "AABBCCDDEEFF"), sha1(`${md5hex("a@b.c")}_AA:BB:CC:DD:EE:FF`));
  assert.equal(credentialFor("pw", "a@b.c", null), "a@b.c/pw", "no transform: email/password, as python-kasa does");
  assert.throws(() => credentialFor("pw", "a@b.c", { type: "password_shadow", params: { passwd_id: 9 } }), /transform 9/);
  assert.equal(ownerMatches(md5hex(EMAIL), EMAIL.toUpperCase()), true);
  assert.equal(ownerMatches(md5hex("other@example.com"), EMAIL), false);
  assert.equal(ownerMatches("", EMAIL), null);
});

/** A fake plug in TPAP mode. */
async function fakeTpapPlug({ password = PASSWORD, owner = md5hex(EMAIL), transform = { type: "password_shadow", params: { passwd_id: 2 } }, discoverCode = 0 } = {}) {
  const state = { on: false, seen: [], logins: 0 };
  let pending = null;
  let session = null;
  const M = ec.decode(hex("02886e2f97ace46e55ba9dd7242579f2993b64e16ef3dcab95afd497333d8fa12f"));
  const NP = ec.decode(hex("03d8bbd6c639c62937b04d997f38c3770719c629d7014d49a24b4f98baa1292b49"));
  const len = (b) => {
    const l = Buffer.alloc(8);
    l.writeBigUInt64LE(BigInt(b.length));
    return Buffer.concat([l, b]);
  };
  const hkdf = (ikm, info, n) => Buffer.from(crypto.hkdfSync("sha256", ikm, Buffer.alloc(0), Buffer.from(info), n));
  const hmac = (k, d) => crypto.createHmac("sha256", k).update(d).digest();
  const json = (res, o) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(o));
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const url = req.url;
      if (url === "/app/handshake1") {
        state.seen.push("klap");
        const reply = '{"error_code":-1010,"result":{"reason":"tpap12"}}'; // 49 bytes, like yours (made up: the real body is unknown)
        return res.writeHead(200).end(reply);
      }
      if (url === "/app") {
        state.seen.push("passthrough");
        return json(res, { error_code: -1010 });
      }
      if (url.startsWith("/stok=")) {
        const token = decodeURIComponent(url.slice(6, url.indexOf("/ds")));
        if (!session || token !== session.stok) return json(res, { error_code: -40401 });
        const seq = body.readInt32BE(0);
        const msg = JSON.parse(session.cipher.decrypt(seq, body));
        let out = { error_code: 0, result: {} };
        if (msg.method === "get_device_info") out.result = { device_on: state.on, nickname: Buffer.from("Fan").toString("base64"), model: "TP15" };
        else if (msg.method === "set_device_info") state.on = Boolean(msg.params.device_on);
        // answer under the request's sequence number
        const c = makeCipher(session.sharedKey, seq);
        return res.writeHead(200).end(c.encrypt(JSON.stringify(out)).body);
      }
      const m = JSON.parse(body.toString() || "{}");
      const sub = m?.params?.sub_method;
      state.seen.push(sub);
      if (sub === "discover") {
        if (discoverCode) return json(res, { error_code: discoverCode });
        return json(res, { error_code: 0, result: { mac: "E4-FA-C4-00-00-01", tpap: { tls: 0, port: server.address().port, pake: [2], dac: 0, ...(owner ? { owner } : {}) } } });
      }
      if (sub === "pake_register") {
        state.logins++;
        const salt = crypto.randomBytes(16);
        const credential = credentialFor(password, EMAIL, transform, "E4FAC4000001");
        const [w0, w1] = deriveW(credential, salt, 1000);
        const y = ec.bigFromBytes(crypto.randomBytes(48)) % ec.N;
        const Y = ec.add(ec.mul(ec.G, y), ec.mul(NP, w0));
        const devRandom = crypto.randomBytes(32);
        pending = { w0, w1, y, Y, devRandom, userRandom: Buffer.from(m.params.user_random, "base64") };
        return json(res, { error_code: 0, result: { dev_random: devRandom.toString("base64"), dev_salt: salt.toString("base64"), dev_share: ec.encode(Y).toString("base64"), cipher_suites: 1, iterations: 1000, encryption: "aes_128_ccm", extra_crypt: transform } });
      }
      if (sub === "pake_share") {
        const p = pending;
        const X = ec.decode(Buffer.from(m.params.user_share, "base64"));
        const Z = ec.mul(ec.add(X, ec.neg(ec.mul(M, p.w0))), p.y);
        const V = ec.mul(ec.mul(ec.G, p.w1), p.y);
        const ctx = sha256(Buffer.concat([Buffer.from("PAKE V1"), p.userRandom, p.devRandom]));
        const t = Buffer.concat([ctx, Buffer.alloc(0), Buffer.alloc(0), ec.encode(M), ec.encode(NP), ec.encode(X), ec.encode(p.Y), ec.encode(Z), ec.encode(V), ec.bytesFromBig(p.w0)].map(len));
        const main = sha256(t);
        const kc = hkdf(main, "ConfirmationKeys", 64);
        if (!hmac(kc.subarray(0, 32), ec.encode(p.Y)).equals(Buffer.from(m.params.user_confirm, "base64"))) return json(res, { error_code: -40411 });
        const sharedKey = hkdf(main, "SharedKey", 32);
        session = { stok: "stok/abc", sharedKey, cipher: makeCipher(sharedKey, 7) };
        return json(res, { error_code: 0, result: { dev_confirm: hmac(kc.subarray(32), ec.encode(X)).toString("base64"), stok: session.stok, start_seq: 7 } });
      }
      res.writeHead(404).end();
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return { ip: `127.0.0.1:${server.address().port}`, state };
}

const opts = (extra = {}) => ({ email: EMAIL, password: PASSWORD, timeoutMs: 5000, allowLoopback: true, ...extra });

test("TPAP: discover, SPAKE2+ login, then read and switch the plug", async () => {
  const plug = await fakeTpapPlug();
  const trace = [];
  const found = await tpapDiscover(plug.ip, opts({ trace }));
  assert.deepEqual({ ...found.tpap, port: 0 }, { tls: 0, port: 0, pake: [2], dac: 0, owner: md5hex(EMAIL) });
  const dev = await tpapLogin(plug.ip, opts({ trace, found }));
  assert.equal(dev.protocol, "tpap");
  const info = await dev.getDeviceInfo();
  assert.equal(info.nickname, "Fan");
  await dev.turnOn();
  assert.equal(plug.state.on, true);
  await dev.turnOff();
  assert.equal(plug.state.on, false);
  assert.deepEqual(trace.map((t) => t.step), ["tpap:discover", "tpap:announced", "tpap:owner", "tpap:pake_register", "tpap:pake_share", "tpap:verify", "tpap:request:get_device_info", "tpap:request:set_device_info", "tpap:request:set_device_info"]);
  const text = JSON.stringify(trace);
  assert.doesNotMatch(text, new RegExp(`${EMAIL}|${PASSWORD}|stok|abc|Fan`), "no secrets, tokens or names in the trace");
});

test("TPAP failures are clear: wrong password, another account's plug, a locked plug", async () => {
  const wrong = await fakeTpapPlug({ password: "the-real-password-is-different" });
  await assert.rejects(tpapLogin(wrong.ip, opts()), (err) => err.code === "auth" && err.step === "pake_share" && /refused the login \(error -40411\)/.test(err.message));
  const other = await fakeTpapPlug({ owner: md5hex("someone-else@example.com") });
  await assert.rejects(tpapLogin(other.ip, opts()), (err) => err.code === "auth" && err.step === "owner" && /different TP-Link account/.test(err.message));
  assert.equal(other.state.logins, 0, "no login attempt on a plug another account owns (it would count toward its lockout)");
  const locked = await fakeTpapPlug({ discoverCode: -40404 });
  await assert.rejects(tpapDiscover(locked.ip, opts()), (err) => err.code === "locked" && /wait about 30 minutes/.test(err.message));
});

test("a plug in TPAP mode answers KLAP with a non-KLAP reply (your 49 bytes), reported plainly", async () => {
  const plug = await fakeTpapPlug();
  const probe = await klapProbe(plug.ip, opts());
  assert.deepEqual({ ...probe }, { protocol: "klap", step: "handshake1", status: 200, bytes: 49, cookie: "absent", shape: "json", errorCode: -1010, result: "not a KLAP answer (KLAP is 48 bytes)" });
  await assert.rejects(klapLogin(plug.ip, opts()), (err) => err.code === "not-klap-answer" && err.bytes === 49 && /probably in TPAP mode/.test(err.message));
});

test("the --debug probe tries each protocol in turn and prints only safe facts", async () => {
  const plug = await fakeTpapPlug();
  const rows = await probeAddress(plug.ip, opts());
  assert.deepEqual(rows.map((r) => `${r.protocol}/${r.step}`), ["tpap/discover", "klap/handshake1", "passthrough/handshake", "tpap/login"]);
  assert.match(rows[0].result, /announced: tls 0, port \d+, pake \[2\], dac 0, owner is this account/);
  assert.match(rows[1].result, /not a KLAP answer/);
  assert.match(rows[2].result, /refused \(error -1010\)/);
  assert.equal(rows[3].result, "OK: logged in, read the plug (off)");
  const lines = rows.map(probeLine).join("\n");
  assert.match(lines, /klap +handshake1 +status=200 bytes=49 cookie=absent shape=json errorCode=-1010/);
  assert.doesNotMatch(`${lines}\n${JSON.stringify(rows)}`, new RegExp(`${EMAIL}|${PASSWORD}|stok/abc`));
});
