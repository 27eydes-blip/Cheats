/**
 * Compact HMAC-SHA256 signed tokens (like a minimal JWT), using WebCrypto so
 * they work on Cloudflare Workers with no dependencies.
 *   token = base64url(JSON payload) + "." + base64url(signature)
 */

const enc = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hmacKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 16) throw new Error("Signing secret missing or too short (min 16 chars)");
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
      "verify",
    ]);
    keyCache.set(secret, k);
  }
  return k;
}

export interface TokenPayload {
  /** token kind, so an admin token can't be used as an access token etc. */
  k: string;
  /** expiry, epoch ms (optional) */
  exp?: number;
  [key: string]: unknown;
}

export async function signToken(payload: TokenPayload, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifyToken<T extends TokenPayload>(
  token: string | undefined | null,
  secret: string,
  kind: string,
): Promise<T | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromB64url(token.slice(dot + 1)),
      enc.encode(body),
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as T;
    if (payload.k !== kind) return null;
    if (typeof payload.exp === "number" && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function randomId(bytes = 16): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Random sticker suffix from an unambiguous alphabet (no 0/O/1/I). */
export function stickerSuffix(len = 6): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export async function sha256Hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}
