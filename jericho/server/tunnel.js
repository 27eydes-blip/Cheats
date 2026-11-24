// Real phone calls need Twilio to reach Jericho from the internet, through a public tunnel
// (ngrok, Cloudflare Tunnel, Tailscale Funnel...). Anyone on the internet can reach that address
// too, so requests that come through it are treated as strangers:
//
//   - Only Twilio's call webhooks (/twilio/voice, /twilio/gather, /twilio/status) and the call
//     audio Twilio plays (/twilio/audio/<unguessable id>) are reachable without the access token.
//     Those are checked separately: every webhook must carry a valid Twilio signature, and all of
//     them are rate limited.
//   - Everything else (the page, the API, memory, PC control, settings) needs JERICHO_ACCESS_TOKEN.
//     If no token is set, it's refused outright.
//   - Wrong tokens are counted per address; after 10 in 10 minutes that address is refused for a while
//     (a visit with no token at all isn't counted, so your own phone can't lock itself out).
//
// Requests from this PC or your home network, not through the tunnel, work as before.
import crypto from "node:crypto";
import { isAllowedHost } from "./guard.js";
import { RateLimiter } from "./ratelimit.js";

export const TWILIO_WEBHOOKS = new Set(["/twilio/voice", "/twilio/gather", "/twilio/status"]);
export const isTwilioAudio = (pathname) => /^\/twilio\/audio\/[0-9a-f]{32}$/.test(pathname);
/** The routes Twilio may use without the access token (signature- and rate-checked instead). */
export const isTwilioRoute = (pathname) => TWILIO_WEBHOOKS.has(pathname) || isTwilioAudio(pathname);

// Headers that tunnels and proxies add. A request carrying any of them came from outside.
const FORWARDED = ["x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "forwarded", "x-real-ip", "cf-connecting-ip", "true-client-ip", "cf-ray", "ngrok-trace-id", "tailscale-funnel-request", "x-original-host"];

function hostOnly(hostHeader) {
  const h = String(hostHeader || "").trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(1, h.indexOf("]"));
  return h.replace(/:\d+$/, "");
}

/** The tunnel's host name, from calls.publicUrl ("" if not set or not a URL). */
export function publicHost(publicUrl) {
  try {
    return publicUrl ? new URL(publicUrl).hostname.toLowerCase() : "";
  } catch {
    return "";
  }
}

/**
 * Did this request come through the public tunnel (or from anywhere outside)? Yes if it's for the
 * tunnel's host name, carries a proxy's forwarding headers, or names a host that isn't this PC or
 * the home network.
 */
export function viaTunnel(headers = {}, { publicUrl = "", extraHosts = [] } = {}) {
  const host = hostOnly(headers.host);
  const pub = publicHost(publicUrl);
  if (pub && host === pub) return true;
  if (FORWARDED.some((h) => headers[h] !== undefined)) return true;
  return !isAllowedHost(headers.host, extraHosts);
}

/** The caller's address, for rate limiting: the tunnel's forwarded address if there is one. */
export function clientAddress(headers = {}, remoteAddress = "") {
  const fwd = String(headers["cf-connecting-ip"] || headers["x-forwarded-for"] || headers["x-real-ip"] || "")
    .split(",")[0]
    .trim();
  return (fwd || String(remoteAddress || "")).replace(/^::ffff:/, "").slice(0, 64) || "unknown";
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** The cookie that lets the page's own files load after you open it once with ?token=. Not the token itself. */
export function pageCookieValue(accessToken) {
  return crypto.createHmac("sha256", accessToken).update("jericho-page-cookie-v1").digest("base64url");
}
export const PAGE_COOKIE = "jericho_page";

function cookie(headers, name) {
  for (const part of String(headers.cookie || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return "";
}

/** Which proof of the token the request carries: "header", "query", "cookie" or "" (none valid). */
export function tokenProof(headers, searchParams, accessToken) {
  if (!accessToken) return "";
  if (headers["x-jericho-token"] && safeEqual(headers["x-jericho-token"], accessToken)) return "header";
  const q = searchParams?.get?.("token");
  if (q && safeEqual(q, accessToken)) return "query";
  const c = cookie(headers, PAGE_COOKIE);
  if (c && safeEqual(c, pageCookieValue(accessToken))) return "cookie";
  return "";
}

/**
 * The gate for everything that isn't a Twilio route. Returns null (go on), or
 * { status, error, retryAfterSeconds?, setCookie? } where setCookie means "go on, and set this cookie".
 */
export function createTunnelGate({ failLimit = 10, failWindowMs = 10 * 60_000, now } = {}) {
  const failures = new RateLimiter({ limit: failLimit, windowMs: failWindowMs, now });
  return {
    failures,
    check({ headers = {}, remoteAddress = "", pathname = "/", searchParams, accessToken = "", publicUrl = "", extraHosts = [], secure = false }) {
      if (isTwilioRoute(pathname)) return null; // Twilio's own checks (signature, rate limit) apply instead
      if (!viaTunnel(headers, { publicUrl, extraHosts })) return null; // this PC or the home network: as before
      if (!accessToken) {
        return { status: 403, error: "Jericho is reachable from the internet here, so it needs JERICHO_ACCESS_TOKEN set in .env. Everything except Twilio's call webhooks is refused until then." };
      }
      const who = clientAddress(headers, remoteAddress);
      if (failures.blocked(who)) return { status: 429, error: "Too many wrong access tokens. Try again later.", retryAfterSeconds: Math.ceil(failWindowMs / 1000) };
      const proof = tokenProof(headers, searchParams, accessToken);
      if (!proof) {
        // only a token that was given and is wrong counts as a guess (not a plain visit)
        const given = headers["x-jericho-token"] || searchParams?.get?.("token") || cookie(headers, PAGE_COOKIE);
        if (given) failures.hit(who);
        return { status: 401, error: "Access token missing or wrong. Open Jericho with ?token=… once." };
      }
      if (proof === "query" && !pathname.startsWith("/api/")) {
        // opened with ?token=: a cookie lets the page's scripts and styles load too
        const flags = ["Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=2592000", ...(secure ? ["Secure"] : [])];
        return { setCookie: `${PAGE_COOKIE}=${pageCookieValue(accessToken)}; ${flags.join("; ")}` };
      }
      return null;
    },
  };
}

/**
 * Limits for Twilio's routes: requests per minute per address, and bad signatures (after 5 wrong
 * signatures in 10 minutes an address is refused for the rest of that time).
 */
export function createWebhookLimiter({ perMinute = 120, badSignatures = 5, now } = {}) {
  const requests = new RateLimiter({ limit: perMinute, windowMs: 60_000, now });
  const bad = new RateLimiter({ limit: badSignatures, windowMs: 10 * 60_000, now });
  return {
    requests,
    bad,
    /** Call first: null to go on, or { status: 429, retryAfterSeconds }. */
    admit(address) {
      if (bad.blocked(address)) return { status: 429, retryAfterSeconds: 600 };
      const r = requests.hit(address);
      return r.ok ? null : { status: 429, retryAfterSeconds: r.retryAfterSeconds };
    },
    /** Call when a signature was missing or wrong. */
    badSignature(address) {
      bad.hit(address);
    },
  };
}
