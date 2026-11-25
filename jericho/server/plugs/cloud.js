// The Tapo cloud, as a fallback when a plug can't be controlled locally: log in with the account,
// list the plugs, and send a plug a command through the cloud ("passthrough"). Plain fetch with
// normal certificate checks and a time limit on every call; no extra libraries. The token is kept
// in memory only (30 minutes). Nothing here logs; errors carry only codes, never bodies or secrets.
import crypto from "node:crypto";

const HOSTS = ["https://wap.tplinkcloud.com", "https://eu-wap.tplinkcloud.com"];
const TOKEN_MS = 30 * 60_000;

export class CloudError extends Error {
  constructor(message, code, cloudCode = null) {
    super(message);
    this.code = code; // "auth" | "unreachable" | "offline" | "error"
    this.cloudCode = cloudCode;
  }
}

let session = null; // { token, host, at, user }

async function call(url, body, { timeoutMs, fetchImpl }) {
  let res;
  try {
    res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new CloudError(err?.name === "TimeoutError" ? "the Tapo cloud didn't answer in time" : "couldn't reach the Tapo cloud", "unreachable");
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    throw new CloudError(`the Tapo cloud answered HTTP ${res.status}`, "error");
  }
  const code = data?.error_code;
  if (code !== 0) {
    // -20601 / -20675: wrong email or password; -20571: device offline
    if ([-20601, -20675, -20004, -20615].includes(code)) throw new CloudError("Tapo didn't accept the email and password in .env", "auth", code);
    if ([-20571, -20002].includes(code)) throw new CloudError("the plug is offline in the Tapo cloud", "offline", code);
    throw new CloudError(`the Tapo cloud answered error ${code}`, "error", code);
  }
  return data.result;
}

/** Logs in (cached 30 minutes per account). */
export async function cloudToken({ email, password, timeoutMs = 8000, fetchImpl = fetch, fresh = false } = {}) {
  const user = crypto.createHash("sha256").update(String(email)).digest("hex"); // which account, without keeping the email
  if (!fresh && session && session.user === user && Date.now() - session.at < TOKEN_MS) return session;
  let last = null;
  for (const host of HOSTS) {
    try {
      const r = await call(host, { method: "login", params: { appType: "Tapo_Android", cloudUserName: email, cloudPassword: password, terminalUUID: crypto.randomUUID() } }, { timeoutMs, fetchImpl });
      session = { token: r.token, host, at: Date.now(), user };
      return session;
    } catch (err) {
      last = err;
      if (err.code === "auth") break; // the other host won't accept it either
    }
  }
  throw last || new CloudError("couldn't reach the Tapo cloud", "unreachable");
}

const b64 = (s) => {
  try {
    return Buffer.from(String(s || ""), "base64").toString("utf8");
  } catch {
    return "";
  }
};
const macOf = (s) =>
  String(s || "")
    .replace(/[^0-9a-f]/gi, "")
    .toLowerCase()
    .replace(/(..)(?!$)/g, "$1:");

/** The account's plugs: [{ name, mac, model, deviceId, appServerUrl, online }]. */
export async function cloudPlugs({ email, password, timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const s = await cloudToken({ email, password, timeoutMs, fetchImpl });
  const r = await call(`${s.host}/?token=${encodeURIComponent(s.token)}`, { method: "getDeviceList" }, { timeoutMs, fetchImpl });
  return (r?.deviceList || [])
    .filter((d) => /PLUG/i.test(String(d.deviceType || "")) || /^P1\d\d/i.test(String(d.deviceModel || "")))
    .map((d) => ({ name: b64(d.alias) || String(d.alias || ""), mac: macOf(d.deviceMac), model: String(d.deviceModel || "").slice(0, 20), deviceId: d.deviceId, appServerUrl: /^https:\/\//.test(String(d.appServerUrl || "")) ? d.appServerUrl : s.host, online: d.status === 1 }));
}

/** One command to a plug through the cloud. */
export async function cloudRequest(plug, method, params, { email, password, timeoutMs = 8000, fetchImpl = fetch } = {}) {
  if (!plug?.deviceId) throw new CloudError("that plug isn't on the Tapo account", "error");
  const send = async (s) => {
    const r = await call(`${plug.appServerUrl || s.host}/?token=${encodeURIComponent(s.token)}`, { method: "passthrough", params: { deviceId: plug.deviceId, requestData: JSON.stringify({ method, ...(params ? { params } : {}) }) } }, { timeoutMs, fetchImpl });
    const data = typeof r?.responseData === "string" ? JSON.parse(r.responseData) : r?.responseData;
    if (data?.error_code && data.error_code !== 0) throw new CloudError(`the plug answered error ${data.error_code} through the cloud`, "error", data.error_code);
    return data?.result ?? {};
  };
  let s = await cloudToken({ email, password, timeoutMs, fetchImpl });
  try {
    return await send(s);
  } catch (err) {
    if (err.cloudCode !== -20651 && err.cloudCode !== -20655) throw err; // token expired: log in again once
    s = await cloudToken({ email, password, timeoutMs, fetchImpl, fresh: true });
    return send(s);
  }
}

/** A plug controlled through the cloud, with the same shape as a local one. */
export function cloudDevice(plug, opts) {
  return {
    protocol: "cloud",
    async getDeviceInfo() {
      const r = await cloudRequest(plug, "get_device_info", null, opts);
      return { ...r, nickname: b64(r?.nickname) || plug.name };
    },
    turnOn: () => cloudRequest(plug, "set_device_info", { device_on: true }, opts),
    turnOff: () => cloudRequest(plug, "set_device_info", { device_on: false }, opts),
  };
}

/** Tests only. */
export function _resetCloudForTests() {
  session = null;
}
