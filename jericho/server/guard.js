// Who may use the API (/api/*), before the access token is even looked at:
//   1. Never another website. A page on some other site can make your browser send requests to
//      Jericho (and could answer "yes" to a confirmation), so cross-site requests are refused,
//      whatever the token.
//   2. Only addresses that really are this PC or your home network in the Host header, so a
//      website can't pose as "localhost" with DNS tricks (DNS rebinding).
//   3. Without an access token, only this PC itself. Other devices on the Wi-Fi need
//      JERICHO_ACCESS_TOKEN set in .env.
import os from "node:os";

const PRIVATE_V4 = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;

export function isLoopback(address) {
  const a = String(address || "").replace(/^::ffff:/, "");
  return a === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a);
}

function hostOnly(hostHeader) {
  const h = String(hostHeader || "").trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(1, h.indexOf("]")); // [::1]:3000
  return h.replace(/:\d+$/, "");
}

/** Is this Host header a name or address of this PC or the home network? */
export function isAllowedHost(hostHeader, extra = []) {
  const h = hostOnly(hostHeader);
  if (!h) return false;
  if (h === "localhost" || h === "::1" || PRIVATE_V4.test(h) || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return true;
  const me = os.hostname().toLowerCase();
  if (h === me || h === `${me}.local` || h === `${me}.lan` || h === `${me}.home`) return true;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net$/.test(h)) return true; // Tailscale names: your own private network
  const cg = /^100\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h); // Tailscale addresses (100.64.0.0/10)
  if (cg && Number(cg[1]) >= 64 && Number(cg[1]) <= 127) return true;
  return extra.map((x) => String(x).toLowerCase()).includes(h);
}

/**
 * Returns null if the request may go on (to the token check), or { status, error } to refuse it.
 * headers: the request headers (lower-case keys), remoteAddress: the client's IP.
 */
export function checkApiRequest({ headers = {}, remoteAddress = "", hasToken = false, extraHosts = [] }) {
  const site = String(headers["sec-fetch-site"] || "");
  if (site === "cross-site" || site === "same-site") return { status: 403, error: "Requests from other websites aren't allowed." };
  const origin = headers.origin;
  if (origin && origin !== "null") {
    let o;
    try {
      o = new URL(origin);
    } catch {
      return { status: 403, error: "Requests from other websites aren't allowed." };
    }
    if (o.host.toLowerCase() !== String(headers.host || "").toLowerCase()) return { status: 403, error: "Requests from other websites aren't allowed." };
  } else if (origin === "null") {
    return { status: 403, error: "Requests from other websites aren't allowed." }; // sandboxed frames, file:// pages
  }
  if (!isAllowedHost(headers.host, extraHosts)) {
    return { status: 403, error: "Open Jericho by this PC's address (for example http://localhost:3000) or add the name to allowedHosts in settings.json." };
  }
  if (!hasToken && !isLoopback(remoteAddress)) {
    return { status: 401, error: "To use Jericho from another device, set JERICHO_ACCESS_TOKEN in .env and open the page with ?token=… (see the README)." };
  }
  return null;
}
