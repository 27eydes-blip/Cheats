// npm run plugs:test -- --debug: tries each known local protocol on one address and returns only
// safe facts (protocol, step, HTTP status, byte lengths, error codes, which variant matched).
// Never credentials, keys, seeds, tokens or response bodies.
import crypto from "node:crypto";
import { fetch as undiciFetch } from "undici";
import { klapProbe } from "./klap.js";
import { ownerMatches, tpapDiscover, tpapLogin } from "./tpap.js";

/** The older "secure passthrough" handshake: only whether it answers, and its error code. */
async function passthroughProbe(ip, { timeoutMs, fetchImpl }) {
  const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 1024 });
  const key = publicKey.export({ type: "spki", format: "pem" });
  try {
    const res = await fetchImpl(`http://${ip}/app`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method: "handshake", params: { key, requestTimeMils: Date.now() } }), signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text().catch(() => "");
    let code = null;
    let hasKey = false;
    try {
      const j = JSON.parse(text);
      code = j?.error_code ?? null;
      hasKey = typeof j?.result?.key === "string";
    } catch {
      /* not JSON */
    }
    return { protocol: "passthrough", step: "handshake", status: res.status, bytes: Buffer.byteLength(text), errorCode: code, result: hasKey ? "answers the older protocol" : res.status === 200 ? `refused (error ${code})` : `HTTP ${res.status}` };
  } catch (err) {
    return { protocol: "passthrough", step: "handshake", result: err?.name === "TimeoutError" ? "no answer in time" : "connection failed" };
  }
}

export async function probeAddress(ip, { email, password, timeoutMs = 5000, fetchImpl = undiciFetch, allowLoopback = false } = {}) {
  const rows = [];
  // 1. TPAP discover (not a login attempt)
  let found = null;
  const tr = [];
  try {
    found = await tpapDiscover(ip, { timeoutMs, fetchImpl, trace: tr, allowLoopback });
    const d = tr[0] || {};
    rows.push({ protocol: "tpap", step: "discover", status: d.status, bytes: d.bytes, errorCode: d.errorCode, result: found ? `announced: tls ${found.tpap.tls}, port ${found.tpap.port}, pake [${found.tpap.pake.join(",")}], dac ${found.tpap.dac}, owner ${ownerMatches(found.tpap.owner, email) === null ? "not given" : ownerMatches(found.tpap.owner, email) ? "is this account" : "is ANOTHER account"}` : "not announced (the plug isn't in TPAP mode)" });
  } catch (err) {
    rows.push({ protocol: "tpap", step: "discover", result: err.message });
  }
  // 2. KLAP handshake1 with every login-hash variant (not a login attempt)
  rows.push(await klapProbe(ip, { email, password, timeoutMs, fetchImpl, allowLoopback }));
  // 3. the older secure-passthrough handshake
  rows.push(await passthroughProbe(ip, { timeoutMs, fetchImpl }));
  // 4. a full TPAP login and a status read, only when the plug announced TPAP (one login attempt)
  if (found) {
    const trace = [];
    try {
      const dev = await tpapLogin(ip, { email, password, timeoutMs, fetchImpl, trace, found, allowLoopback });
      const info = await dev.getDeviceInfo();
      rows.push({ protocol: "tpap", step: "login", result: `OK: logged in, read the plug (${info.device_on ? "on" : "off"})`, trace });
    } catch (err) {
      rows.push({ protocol: "tpap", step: err.step || "login", errorCode: err.errorCode ?? null, result: `failed: ${err.message}`, trace });
    }
  }
  return rows;
}

/** One probe row as a safe line (known fields only). */
export function probeLine(r) {
  const keep = ["status", "bytes", "cookie", "shape", "errorCode", "matched"];
  const facts = keep.filter((k) => r[k] !== undefined && r[k] !== null).map((k) => `${k}=${String(r[k]).slice(0, 40)}`).join(" ");
  return `${r.protocol.padEnd(11)} ${String(r.step).padEnd(14)} ${facts ? `${facts}  ` : ""}-> ${String(r.result).slice(0, 160)}`;
}
