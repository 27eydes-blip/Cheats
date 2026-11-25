// TPAP: TP-Link's newer local login, used by Tapo plugs on firmware 1.4.0 and later while
// "Third-Party Compatibility" is OFF in the Tapo app (with it on, they speak KLAP).
// Built from the two maintained open-source implementations: the `tapo` library
// (mihai-dinculescu/tapo, Rust/Python, which ships TPAP) and python-kasa's TPAP pull request (#1592).
//
//   discover        POST http://IP/  {"method":"login","params":{"sub_method":"discover"}}
//                   -> result.tpap: { tls, port, pake: [...], dac }, result.mac
//   pake_register   our random + the passcode type -> the device's random, salt, share, iterations
//   pake_share      SPAKE2+ (RFC 9383, P-256, SHA-256, HKDF, HMAC) -> stok + start sequence
//   requests        POST {url}/stok=TOKEN/ds, AES-128-CCM, body = seq (4 bytes) + ciphertext + tag
//
// node:crypto for everything except the raw P-256 point math (./p256.js). Every request has a
// time limit. Nothing here logs; `trace` collects only safe facts for npm run plugs:test -- --debug.
import crypto from "node:crypto";
import { Agent, fetch as undiciFetch } from "undici";
import { isLocalAddress } from "../roku/ecp.js";
import * as ec from "./p256.js";

export class TpapError extends Error {
  /** code: "not-tpap" | "unreachable" | "auth" | "locked" | "bad-response" | "unsupported" | "device-error" */
  constructor(message, code, step, extra = {}) {
    super(message);
    this.code = code;
    this.step = step;
    Object.assign(this, extra);
  }
}

const sha256 = (b) => crypto.createHash("sha256").update(b).digest();
const md5hex = (s) => crypto.createHash("md5").update(String(s)).digest("hex");
const sha1hex = (s) => crypto.createHash("sha1").update(String(s)).digest("hex");
const hkdf = (ikm, salt, info, len) => Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, len));
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

// RFC 9383 points M and N for P-256
const M = ec.decode(Buffer.from("02886e2f97ace46e55ba9dd7242579f2993b64e16ef3dcab95afd497333d8fa12f", "hex"));
const NP = ec.decode(Buffer.from("03d8bbd6c639c62937b04d997f38c3770719c629d7014d49a24b4f98baa1292b49", "hex"));
const CIPHER_SUITE = 1; // P-256, SHA-256, HMAC-SHA256
const ENCRYPTION = "aes_128_ccm";
const MAX_ITERATIONS = 100_000;

// Device answer codes seen on the login steps
const LOCKED = new Set([-40404, -40413]);
const BAD_LOGIN = new Set([-40411, -40412, -40401, -1501, -40210, -40106]);

// ---- SPAKE2+ (prover side) ------------------------------------------------------------------------

const lenLE = (b) => {
  const l = Buffer.alloc(8);
  l.writeBigUInt64LE(BigInt(b.length));
  return Buffer.concat([l, b]);
};

/** w0, w1: PBKDF2-HMAC-SHA256 of the credential (80 bytes), each half reduced mod the group order. */
export function deriveW(credential, salt, iterations) {
  const key = crypto.pbkdf2Sync(Buffer.from(credential, "utf8"), salt, iterations, 80, "sha256");
  return [ec.bigFromBytes(key.subarray(0, 40)) % ec.N, ec.bigFromBytes(key.subarray(40)) % ec.N];
}

/** The prover's share, its confirmation, the shared key and what the device must confirm with. */
export function proveWith(w0, w1, x, context, deviceShareBytes, idProver = Buffer.alloc(0), idVerifier = Buffer.alloc(0)) {
  const share = ec.add(ec.mul(ec.G, x), ec.mul(M, w0));
  const Y = ec.decode(deviceShareBytes);
  if (!Y) throw new TpapError("the plug's share isn't a point on the curve", "bad-response", "pake_register");
  const unmasked = ec.add(Y, ec.neg(ec.mul(NP, w0)));
  const Z = ec.mul(unmasked, x);
  const V = ec.mul(unmasked, w1);
  if (!Z || !V) throw new TpapError("the plug's share leads to a key that isn't secret", "bad-response", "pake_register");
  const X = ec.encode(share);
  const Yb = ec.encode(Y);
  const transcript = Buffer.concat([context, idProver, idVerifier, ec.encode(M), ec.encode(NP), X, Yb, ec.encode(Z), ec.encode(V), ec.bytesFromBig(w0)].map(lenLE));
  const main = sha256(transcript);
  const confirmKeys = hkdf(main, Buffer.alloc(0), Buffer.from("ConfirmationKeys"), 64);
  const sharedKey = hkdf(main, Buffer.alloc(0), Buffer.from("SharedKey"), 32);
  return { share: X, confirm: hmac(confirmKeys.subarray(0, 32), Yb), sharedKey, expectDeviceConfirm: hmac(confirmKeys.subarray(32), X) };
}

export function prove(credential, salt, iterations, userRandom, deviceRandom, deviceShare) {
  const [w0, w1] = deriveW(credential, salt, iterations);
  let x = 0n;
  while (x === 0n) x = ec.bigFromBytes(crypto.randomBytes(48)) % ec.N;
  const context = sha256(Buffer.concat([Buffer.from("PAKE V1"), userRandom, deviceRandom]));
  return proveWith(w0, w1, x, context, deviceShare);
}

// ---- the password transform the plug asks for (extra_crypt) -----------------------------------------

/** SHA-256-crypt (crypt(3) "$5$"), for passwd_id 5. */
export function sha256Crypt(password, salt, rounds) {
  const pw = Buffer.from(password, "utf8");
  const custom = rounds != null;
  rounds = custom ? Math.min(999999999, Math.max(1000, rounds)) : 5000;
  const s = Buffer.from(String(salt).slice(0, 16), "utf8");
  const H = (...parts) => sha256(Buffer.concat(parts));
  const B = H(pw, s, pw);
  let a = Buffer.concat([pw, s]);
  for (let i = pw.length; i > 0; i -= 32) a = Buffer.concat([a, B.subarray(0, Math.min(32, i))]);
  for (let i = pw.length; i > 0; i >>= 1) a = Buffer.concat([a, i & 1 ? B : pw]);
  let Aout = sha256(a);
  const DP = H(...Array(pw.length).fill(pw));
  const Pseq = Buffer.concat([...Array(Math.floor(pw.length / 32)).fill(DP), DP.subarray(0, pw.length % 32)]);
  const DS = H(...Array(16 + Aout[0]).fill(s));
  const Sseq = Buffer.concat([...Array(Math.floor(s.length / 32)).fill(DS), DS.subarray(0, s.length % 32)]);
  for (let i = 0; i < rounds; i++) {
    const parts = [i & 1 ? Pseq : Aout];
    if (i % 3) parts.push(Sseq);
    if (i % 7) parts.push(Pseq);
    parts.push(i & 1 ? Aout : Pseq);
    Aout = H(...parts);
  }
  const ALPHA = "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const groups = [[0, 10, 20], [21, 1, 11], [12, 22, 2], [3, 13, 23], [24, 4, 14], [15, 25, 5], [6, 16, 26], [27, 7, 17], [18, 28, 8], [9, 19, 29]];
  let out = "";
  const push = (v, n) => {
    for (let i = 0; i < n; i++) {
      out += ALPHA[v & 63];
      v >>= 6;
    }
  };
  for (const [a1, b1, c1] of groups) push((Aout[a1] << 16) | (Aout[b1] << 8) | Aout[c1], 4);
  push((Aout[31] << 8) | Aout[30], 3);
  return `$5$${custom ? `rounds=${rounds}$` : ""}${s.toString("utf8")}$${out}`;
}

/** The string that stands in for the password, as the plug's extra_crypt asks. */
export function credentialFor(password, email, extraCrypt, mac = "") {
  if (!extraCrypt || typeof extraCrypt !== "object") return email ? `${email}/${password}` : password; // python-kasa's choice for no transform
  const type = String(extraCrypt.type || "").toLowerCase();
  const p = extraCrypt.params || {};
  if (type === "password_shadow") {
    const id = Number(p.passwd_id);
    if (id === 2) return sha1hex(password);
    if (id === 3) {
      const m = String(mac).replace(/[^0-9a-f]/gi, "");
      if (!email || m.length !== 12) return password;
      return sha1hex(`${md5hex(email)}_${m.toUpperCase().match(/../g).join(":")}`);
    }
    if (id === 4) return password;
    if (id === 5) {
      const prefix = String(p.passwd_prefix || "");
      const fromPrefix = /^\$5\$(?:rounds=(\d+)\$)?([^$]*)/.exec(prefix);
      const salt = p.passwd_salt ?? fromPrefix?.[2];
      const rounds = p.passwd_rounds ?? (fromPrefix?.[1] ? Number(fromPrefix[1]) : undefined);
      if (salt == null) throw new TpapError("the plug asks for a password transform without a salt", "unsupported", "pake_register");
      if (rounds != null && rounds > MAX_ITERATIONS) throw new TpapError("the plug asks for too many password rounds", "unsupported", "pake_register");
      return sha256Crypt(password, salt, rounds);
    }
    throw new TpapError(`the plug asks for password transform ${id}, which isn't supported yet`, "unsupported", "pake_register", { passwdId: id });
  }
  if (type === "password_sha_with_salt") {
    const hint = Number(p.sha_name) === 0 ? "admin" : "user";
    const salt = Buffer.from(String(p.sha_salt || ""), "base64").toString("utf8");
    return sha256(Buffer.from(hint + salt + password)).toString("hex");
  }
  throw new TpapError(`the plug asks for password transform "${type}", which isn't supported yet`, "unsupported", "pake_register");
}

// ---- the session cipher -----------------------------------------------------------------------------

export function makeCipher(sharedKey, startSeq) {
  const key = hkdf(sharedKey, Buffer.from("tp-kdf-salt-aes128-key"), Buffer.from("tp-kdf-info-aes128-key"), 16);
  const base = hkdf(sharedKey, Buffer.from("tp-kdf-salt-aes128-iv"), Buffer.from("tp-kdf-info-aes128-iv"), 12);
  let seq = startSeq | 0;
  const nonce = (s) => {
    const n = Buffer.alloc(12);
    base.copy(n, 0, 0, 8);
    n.writeInt32BE(s, 8);
    return n;
  };
  return {
    encrypt(text) {
      const s = seq;
      seq = seq === 2147483647 ? -2147483648 : seq + 1;
      const c = crypto.createCipheriv("aes-128-ccm", key, nonce(s), { authTagLength: 16 });
      const data = Buffer.from(text, "utf8");
      c.setAAD(Buffer.alloc(0), { plaintextLength: data.length });
      const enc = Buffer.concat([c.update(data), c.final(), c.getAuthTag()]);
      const head = Buffer.alloc(4);
      head.writeInt32BE(s);
      return { body: Buffer.concat([head, enc]), seq: s };
    },
    decrypt(s, body) {
      if (body.length < 20) throw new Error("too short");
      if (body.readInt32BE(0) !== s) throw new Error("wrong sequence");
      const enc = body.subarray(4, body.length - 16);
      const d = crypto.createDecipheriv("aes-128-ccm", key, nonce(s), { authTagLength: 16 });
      d.setAuthTag(body.subarray(body.length - 16));
      d.setAAD(Buffer.alloc(0), { plaintextLength: enc.length });
      return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
    },
  };
}

// ---- HTTP ------------------------------------------------------------------------------------------

let insecure = null; // the plugs' TLS certificates are their own; only for home-network addresses
const plugTls = () => (insecure ||= new Agent({ connect: { rejectUnauthorized: false, timeout: 4000 } }));

async function postJson(url, body, { timeoutMs, step, fetchImpl }) {
  let res;
  try {
    res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs), ...(url.startsWith("https:") ? { dispatcher: plugTls() } : {}) });
  } catch (err) {
    throw new TpapError(err?.name === "TimeoutError" ? "no answer in time" : "connection failed", "unreachable", step);
  }
  const text = await res.text().catch(() => "");
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, json, bytes: Buffer.byteLength(text) };
}

const hostOk = (ip, allowLoopback) => isLocalAddress(String(ip).split(":")[0]) || (allowLoopback && /^127\.0\.0\.1(:\d+)?$/.test(ip));

/**
 * Asks the plug whether it's in TPAP mode. Returns { tpap: { tls, port, pake, dac, owner }, mac }
 * or null (not TPAP). Safe facts go to `trace`.
 */
export async function tpapDiscover(ip, { timeoutMs = 5000, fetchImpl = undiciFetch, trace = [], allowLoopback = false } = {}) {
  if (!hostOk(ip, allowLoopback)) throw new TpapError("not a home-network address", "unreachable", "start");
  const r = await postJson(`http://${ip}/`, { method: "login", params: { sub_method: "discover" } }, { timeoutMs, step: "discover", fetchImpl });
  const t = r.json?.result?.tpap;
  trace.push({ step: "tpap:discover", status: r.status, bytes: r.bytes, errorCode: r.json?.error_code ?? null, tpap: t && typeof t === "object" ? "announced" : "no" });
  if (LOCKED.has(r.json?.error_code)) throw new TpapError("the plug has locked itself after too many failed logins; wait about 30 minutes", "locked", "discover");
  if (r.status !== 200 || !t || typeof t !== "object") return null;
  const info = { tls: Number(t.tls) || 0, port: Number(t.port) || 80, pake: Array.isArray(t.pake) ? t.pake.map(Number) : [], dac: Number(t.dac) || 0, owner: typeof t.owner === "string" ? t.owner.toLowerCase() : typeof r.json.result.owner === "string" ? r.json.result.owner.toLowerCase() : "" };
  trace.push({ step: "tpap:announced", tls: info.tls, port: info.port, pake: info.pake.join(","), dac: info.dac, owner: info.owner ? "present" : "absent" });
  return { tpap: info, mac: typeof r.json.result.mac === "string" ? r.json.result.mac : "" };
}

/** Is the plug owned by this account? (discovery gives the md5 of the owner's email) */
export function ownerMatches(owner, email) {
  if (!owner) return null;
  const e = String(email || "").trim();
  return [e, e.toLowerCase()].some((x) => md5hex(x) === owner);
}

/**
 * Logs in over TPAP. Returns { protocol: "tpap", request, getDeviceInfo, turnOn, turnOff }.
 * `found` is the discover answer (asked for if not given).
 */
export async function tpapLogin(ip, { email, password, timeoutMs = 5000, fetchImpl = undiciFetch, trace = [], found = null, allowLoopback = false } = {}) {
  const d = found || (await tpapDiscover(ip, { timeoutMs, fetchImpl, trace, allowLoopback }));
  if (!d) throw new TpapError("this plug doesn't announce TPAP", "not-tpap", "discover");
  const info = d.tpap;
  if (info.tls > 1) throw new TpapError("the plug wants a verified certificate login, which isn't supported", "unsupported", "discover");
  if (!(info.pake.includes(2) || info.pake.includes(5)) || (info.pake.includes(0) && !info.pake.includes(2))) {
    throw new TpapError(`the plug only takes passcode types ${info.pake.join(",") || "none"} (it may still be in setup)`, "unsupported", "discover");
  }
  const own = ownerMatches(info.owner, email);
  trace.push({ step: "tpap:owner", matches: own === null ? "unknown" : own ? "yes" : "no" });
  if (own === false) throw new TpapError("the plug belongs to a different TP-Link account than the one in .env", "auth", "owner");
  const port = String(ip).includes(":") ? "" : `:${info.port}`;
  const url = `${info.tls === 1 ? "https" : "http"}://${ip}${port}`;

  // pake_register
  const userRandom = crypto.randomBytes(32);
  const reg = await postJson(`${url}/`, { method: "login", params: { sub_method: "pake_register", username: md5hex("admin"), user_random: userRandom.toString("base64"), cipher_suites: [CIPHER_SUITE], encryption: [ENCRYPTION], passcode_type: "userpw" } }, { timeoutMs, step: "pake_register", fetchImpl });
  const rr = reg.json?.result || {};
  trace.push({ step: "tpap:pake_register", status: reg.status, errorCode: reg.json?.error_code ?? null, cipherSuites: rr.cipher_suites ?? null, encryption: rr.encryption ?? null, iterations: rr.iterations ?? null, transform: rr.extra_crypt ? `${rr.extra_crypt.type}${rr.extra_crypt.params?.passwd_id != null ? `/${rr.extra_crypt.params.passwd_id}` : ""}` : "none" });
  checkCode(reg, "pake_register");
  if (Number(rr.cipher_suites) !== CIPHER_SUITE) throw new TpapError(`the plug picked cipher suite ${rr.cipher_suites}, which isn't supported`, "unsupported", "pake_register");
  if (String(rr.encryption) !== ENCRYPTION) throw new TpapError(`the plug picked ${rr.encryption} encryption, which isn't supported`, "unsupported", "pake_register");
  const iterations = Number(rr.iterations ?? 10000);
  if (!(iterations >= 1 && iterations <= MAX_ITERATIONS)) throw new TpapError("the plug asked for an unreasonable number of iterations", "bad-response", "pake_register");
  const deviceRandom = Buffer.from(String(rr.dev_random || ""), "base64");
  if (deviceRandom.length !== 32) throw new TpapError("the plug's random value isn't 32 bytes", "bad-response", "pake_register");
  const credential = credentialFor(password, email, rr.extra_crypt, d.mac);
  const proof = prove(credential, Buffer.from(String(rr.dev_salt || ""), "base64"), iterations, userRandom, deviceRandom, Buffer.from(String(rr.dev_share || ""), "base64"));

  // pake_share
  const share = await postJson(`${url}/`, { method: "login", params: { sub_method: "pake_share", user_share: proof.share.toString("base64"), user_confirm: proof.confirm.toString("base64") } }, { timeoutMs, step: "pake_share", fetchImpl });
  trace.push({ step: "tpap:pake_share", status: share.status, errorCode: share.json?.error_code ?? null });
  checkCode(share, "pake_share");
  const sr = share.json?.result || {};
  const devConfirm = Buffer.from(String(sr.dev_confirm || ""), "base64");
  if (devConfirm.length !== 32 || !crypto.timingSafeEqual(devConfirm, proof.expectDeviceConfirm)) {
    trace.push({ step: "tpap:verify", matched: "no" });
    throw new TpapError("the plug didn't prove it knows the same password (wrong password, or a different password transform)", "auth", "pake_share");
  }
  trace.push({ step: "tpap:verify", matched: "yes" });
  if (!sr.stok) throw new TpapError("the plug gave no session token", "bad-response", "pake_share");
  const cipher = makeCipher(proof.sharedKey, Number(sr.start_seq) || 0);
  const dsUrl = `${url}/stok=${encodeURIComponent(sr.stok)}/ds`;
  const terminalUUID = crypto.randomUUID();

  async function request(method, params) {
    const { body, seq } = cipher.encrypt(JSON.stringify({ method, ...(params ? { params } : {}), requestTimeMils: Date.now(), terminalUUID }));
    let res;
    try {
      res = await fetchImpl(dsUrl, { method: "POST", headers: { "content-type": "application/octet-stream" }, body, signal: AbortSignal.timeout(timeoutMs), ...(dsUrl.startsWith("https:") ? { dispatcher: plugTls() } : {}) });
    } catch (err) {
      throw new TpapError(err?.name === "TimeoutError" ? "no answer in time" : "connection failed", "unreachable", `request:${method}`);
    }
    const buf = Buffer.from(await res.arrayBuffer().catch(() => new ArrayBuffer(0)));
    if (res.status !== 200) {
      trace.push({ step: `tpap:request:${method}`, status: res.status });
      throw new TpapError(`the plug answered HTTP ${res.status}`, "bad-response", `request:${method}`, { status: res.status });
    }
    let out;
    try {
      out = JSON.parse(cipher.decrypt(seq, buf));
    } catch {
      let code = null;
      try {
        code = JSON.parse(buf.toString("utf8"))?.error_code ?? null; // a dropped session answers in plain JSON
      } catch {
        /* not JSON either */
      }
      trace.push({ step: `tpap:request:${method}`, status: 200, decrypt: "failed", errorCode: code });
      throw new TpapError(code != null ? `the plug dropped the session (error ${code})` : "couldn't read the plug's answer", code != null ? "unreachable" : "bad-response", `request:${method}`);
    }
    trace.push({ step: `tpap:request:${method}`, status: 200, errorCode: out?.error_code ?? null });
    if (out?.error_code !== 0) throw new TpapError(`the plug answered error ${out?.error_code}`, "device-error", `request:${method}`, { errorCode: out?.error_code });
    return out.result;
  }
  const b64 = (s) => {
    try {
      return Buffer.from(String(s || ""), "base64").toString("utf8");
    } catch {
      return "";
    }
  };
  return {
    protocol: "tpap",
    request,
    async getDeviceInfo() {
      const r = await request("get_device_info");
      return { ...r, nickname: b64(r?.nickname), ssid: undefined };
    },
    turnOn: () => request("set_device_info", { device_on: true }),
    turnOff: () => request("set_device_info", { device_on: false }),
  };
}

function checkCode(r, step) {
  const code = r.json?.error_code;
  if (r.status !== 200) throw new TpapError(`${step} answered HTTP ${r.status}`, r.status === 403 ? "auth" : "bad-response", step, { status: r.status });
  if (code === 0) return;
  if (LOCKED.has(code)) throw new TpapError("the plug has locked itself after too many failed logins; wait about 30 minutes", "locked", step, { errorCode: code });
  if (BAD_LOGIN.has(code)) throw new TpapError(`the plug refused the login (error ${code})`, "auth", step, { errorCode: code });
  throw new TpapError(`${step} failed with error ${code}`, "device-error", step, { errorCode: code });
}
