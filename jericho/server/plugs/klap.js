// Our own KLAP client for Tapo (and newer Kasa) plugs: local control over HTTP port 80 with
// AES session keys, no extra libraries. Supports both login-hash variants:
//   KLAP v2 (Tapo):  auth = sha256(sha1(email) + sha1(password)),
//                    handshake1 proof = sha256(local + remote + auth), handshake2 = sha256(remote + local + auth)
//   KLAP v1 (Kasa):  auth = md5(md5(email) + md5(password)),
//                    handshake1 proof = sha256(local + auth),           handshake2 = sha256(remote + auth)
// Unlike tp-link-tapo-connect 2.0.15, a missing session cookie is fine (newer firmware leaves it
// out; that's what crashed with "Cannot read properties of undefined (reading '0')").
// Every step has a time limit. Nothing here logs; `trace` collects only safe facts for --debug.
import crypto from "node:crypto";
import { isLocalAddress } from "../roku/ecp.js";

const sha256 = (b) => crypto.createHash("sha256").update(b).digest();
const sha1 = (b) => crypto.createHash("sha1").update(b).digest();
const md5 = (b) => crypto.createHash("md5").update(b).digest();
const utf8 = (s) => Buffer.from(String(s), "utf8");

export class KlapError extends Error {
  /** code: "not-klap" | "unreachable" | "auth" | "bad-response" | "device-error"; step: where it failed */
  constructor(message, code, step, extra = {}) {
    super(message);
    this.code = code;
    this.step = step;
    Object.assign(this, extra);
  }
}

export const authHashV2 = (email, password) => sha256(Buffer.concat([sha1(utf8(email)), sha1(utf8(password))]));
export const authHashV1 = (email, password) => md5(Buffer.concat([md5(utf8(email)), md5(utf8(password))]));
export const proofV2 = (local, remote, auth) => sha256(Buffer.concat([local, remote, auth]));
export const proofV1 = (local, _remote, auth) => sha256(Buffer.concat([local, auth]));
const finishV2 = (local, remote, auth) => sha256(Buffer.concat([remote, local, auth]));
const finishV1 = (_local, remote, auth) => sha256(Buffer.concat([remote, auth]));

// Logins a plug may have instead of yours, used only to explain a failure ("set up on another
// account" / "not set up yet"). Never sent anywhere: they're only hashed and compared locally.
const KNOWN_OTHER = [
  ["blank", "", ""],
  ["kasa default", "kasa@tp-link.net", "kasaSetup"],
  ["tapo default", "test@tp-link.net", "test"],
];

/** Which login the plug's handshake1 proof matches: { version, auth } or { other: label } or null. */
export function matchProof(local, remote, serverProof, email, password) {
  const emails = [...new Set([email, String(email).trim(), String(email).trim().toLowerCase()])];
  for (const e of emails) {
    const v2 = authHashV2(e, password);
    if (proofV2(local, remote, v2).equals(serverProof)) return { version: 2, auth: v2 };
    const v1 = authHashV1(e, password);
    if (proofV1(local, remote, v1).equals(serverProof)) return { version: 1, auth: v1 };
  }
  for (const [label, e, p] of KNOWN_OTHER) {
    if (proofV2(local, remote, authHashV2(e, p)).equals(serverProof) || proofV1(local, remote, authHashV1(e, p)).equals(serverProof)) return { other: label };
  }
  return null;
}

/**
 * For npm run plugs:test -- --debug: only handshake1 (which isn't a login attempt), and which
 * login-hash variant the plug's proof matches. Safe facts only.
 */
export async function klapProbe(ip, { email, password, timeoutMs = 5000, fetchImpl = fetch, allowLoopback = false } = {}) {
  if (!isLocalAddress(String(ip).split(":")[0]) && !(allowLoopback && /^127\.0\.0\.1(:\d+)?$/.test(ip))) return { protocol: "klap", step: "start", result: "not a home-network address" };
  const local = crypto.randomBytes(16);
  let h1;
  try {
    h1 = await post(`http://${ip}/app/handshake1`, local, { timeoutMs, fetchImpl, step: "handshake1" });
  } catch (err) {
    return { protocol: "klap", step: "handshake1", result: err.message };
  }
  const out = { protocol: "klap", step: "handshake1", status: h1.status, bytes: h1.buf.length, cookie: sessionCookie(h1.headers) ? "present" : "absent" };
  if (h1.buf.length !== 48) {
    try {
      const j = JSON.parse(h1.buf.toString("utf8"));
      Object.assign(out, { shape: "json", errorCode: j?.error_code ?? null });
    } catch {
      out.shape = h1.buf.length ? "binary" : "empty";
    }
    out.result = h1.status === 200 ? `not a KLAP answer (KLAP is 48 bytes)` : `HTTP ${h1.status}`;
    return out;
  }
  const m = matchProof(local, h1.buf.subarray(0, 16), h1.buf.subarray(16, 48), email, password);
  out.matched = m?.version ? `klap-v${m.version}` : m?.other || "none";
  out.result = m?.version ? "KLAP login would work" : m?.other ? `set up with a different login (${m.other})` : "no login-hash variant matched (v2, v1, email as typed/lowercase)";
  return out;
}

/** The session cookie, from however the response carries it (or "" when there's none). */
function sessionCookie(headers) {
  const all = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get?.("set-cookie")].filter(Boolean);
  for (const c of all) {
    const m = /(TP_SESSIONID=[^;]+)/i.exec(String(c));
    if (m) return m[1];
  }
  return "";
}

async function post(url, body, { cookie, timeoutMs, fetchImpl, step }) {
  let res;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      body,
      headers: { "content-type": "application/octet-stream", ...(cookie ? { cookie } : {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new KlapError(err?.name === "TimeoutError" ? "no answer in time" : "connection failed", "unreachable", step);
  }
  const buf = Buffer.from(await res.arrayBuffer().catch(() => new ArrayBuffer(0)));
  return { status: res.status, buf, headers: res.headers };
}

/**
 * Logs in to a plug over KLAP. Returns { version, request(method, params), getDeviceInfo, turnOn,
 * turnOff }. trace (optional array) gets safe facts: steps, statuses, sizes, cookie present or not,
 * which hash variant matched, device error codes. Never credentials, keys, seeds or bodies.
 */
export async function klapLogin(ip, { email, password, timeoutMs = 5000, fetchImpl = fetch, trace = [], allowLoopback = false } = {}) {
  if (!isLocalAddress(String(ip).split(":")[0]) && !(allowLoopback && /^127\.0\.0\.1(:\d+)?$/.test(ip))) throw new KlapError("not a home-network address", "unreachable", "start");
  const base = `http://${ip}/app`;
  const local = crypto.randomBytes(16);

  // handshake1: our seed -> their seed and a proof of which login they expect
  const h1 = await post(`${base}/handshake1`, local, { timeoutMs, fetchImpl, step: "handshake1" });
  const cookie = sessionCookie(h1.headers);
  trace.push({ step: "handshake1", status: h1.status, bytes: h1.buf.length, cookie: cookie ? "present" : "absent" });
  if (h1.status === 404) throw new KlapError("this plug doesn't speak KLAP (older firmware)", "not-klap", "handshake1");
  if (h1.status !== 200) throw new KlapError(`handshake1 answered HTTP ${h1.status}`, "bad-response", "handshake1", { status: h1.status });
  if (h1.buf.length !== 48) {
    // Not a KLAP answer (16-byte seed + 32-byte proof). A plug in TPAP mode answers with something
    // else, often a short JSON error: only whether it's JSON and its error code are recorded.
    let code = null;
    let json = false;
    try {
      const j = JSON.parse(h1.buf.toString("utf8"));
      json = true;
      code = j?.error_code ?? null;
    } catch {
      /* binary */
    }
    trace.push({ step: "handshake1", shape: json ? "json" : "binary", errorCode: code });
    throw new KlapError(`handshake1 answer was ${h1.buf.length} bytes, not the 48 of KLAP${json ? ` (JSON, error ${code})` : ""}: the plug is probably in TPAP mode`, "not-klap-answer", "handshake1", { bytes: h1.buf.length, errorCode: code });
  }
  const remote = h1.buf.subarray(0, 16);
  const match = matchProof(local, remote, h1.buf.subarray(16, 48), email, password);
  trace.push({ step: "verify", matched: match?.version ? `klap-v${match.version}` : match?.other || "none" });
  if (!match) throw new KlapError("the plug didn't accept this Tapo email and password", "auth", "verify");
  if (match.other) throw new KlapError(`the plug is set up with a different login (${match.other}), not this Tapo account`, "auth", "verify", { other: match.other });

  // handshake2: prove we know the login too
  const finish = (match.version === 2 ? finishV2 : finishV1)(local, remote, match.auth);
  const h2 = await post(`${base}/handshake2`, finish, { cookie, timeoutMs, fetchImpl, step: "handshake2" });
  trace.push({ step: "handshake2", status: h2.status });
  if (h2.status !== 200) throw new KlapError(`handshake2 answered HTTP ${h2.status}`, h2.status === 403 ? "auth" : "bad-response", "handshake2", { status: h2.status });

  // the session: key, IV and signature, all derived from both seeds and the login hash
  const derive = (label) => sha256(Buffer.concat([utf8(label), local, remote, match.auth]));
  const key = derive("lsk").subarray(0, 16);
  const ivFull = derive("iv");
  const sig = derive("ldk").subarray(0, 28);
  let seq = ivFull.readInt32BE(28);
  const terminalUUID = crypto.randomUUID();

  async function request(method, params) {
    seq = seq === 2147483647 ? -2147483648 : seq + 1;
    const seqBuf = Buffer.alloc(4);
    seqBuf.writeInt32BE(seq);
    const iv = Buffer.concat([ivFull.subarray(0, 12), seqBuf]);
    const c = crypto.createCipheriv("aes-128-cbc", key, iv);
    const plain = JSON.stringify({ method, ...(params ? { params } : {}), requestTimeMils: Date.now(), terminalUUID });
    const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
    const body = Buffer.concat([sha256(Buffer.concat([sig, seqBuf, enc])), enc]);
    const r = await post(`${base}/request?seq=${seq}`, body, { cookie, timeoutMs, fetchImpl, step: `request:${method}` });
    if (r.status !== 200) {
      trace.push({ step: `request:${method}`, status: r.status });
      throw new KlapError(`the plug answered HTTP ${r.status}`, r.status === 403 ? "auth" : "bad-response", `request:${method}`, { status: r.status });
    }
    let out;
    try {
      const d = crypto.createDecipheriv("aes-128-cbc", key, iv);
      out = JSON.parse(Buffer.concat([d.update(r.buf.subarray(32)), d.final()]).toString("utf8"));
    } catch {
      trace.push({ step: `request:${method}`, status: 200, decrypt: "failed" });
      throw new KlapError("couldn't read the plug's answer", "bad-response", `request:${method}`);
    }
    trace.push({ step: `request:${method}`, status: 200, errorCode: out?.error_code ?? null, resultKeys: out?.result && typeof out.result === "object" ? Object.keys(out.result).length : 0 });
    if (out?.error_code !== 0) throw new KlapError(`the plug answered error ${out?.error_code}`, "device-error", `request:${method}`, { errorCode: out?.error_code });
    return out.result;
  }

  return {
    protocol: `klap-v${match.version}`,
    request,
    async getDeviceInfo() {
      const r = await request("get_device_info");
      const b64 = (s) => {
        try {
          return Buffer.from(String(s || ""), "base64").toString("utf8");
        } catch {
          return "";
        }
      };
      return { ...r, nickname: b64(r?.nickname), ssid: undefined };
    },
    turnOn: () => request("set_device_info", { device_on: true }),
    turnOff: () => request("set_device_info", { device_on: false }),
  };
}
