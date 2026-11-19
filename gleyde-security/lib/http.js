/* Helpers shared by the API functions. Kept outside /functions so they never become routes. */

/* Pages' _headers file only applies to static assets, so function
   responses set their own security headers. */
export const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cache-Control": "no-store",
};

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...extra },
  });
}

export function allowedOrigins(request, env) {
  return new Set([
    new URL(request.url).origin,
    ...String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
  ]);
}

/* Blocks cross-site browser posts. Requests with no Origin are only refused when the
   browser says they are cross-site (non-browser clients can send anything anyway). */
export function isSameOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (origin) return allowedOrigins(request, env).has(origin);
  const site = request.headers.get("Sec-Fetch-Site");
  return !site || site === "same-origin";
}

/* Reads a stream with a hard byte cap, even when Content-Length is absent (chunked)
   or wrong, so a huge upload can't exhaust memory. Returns null when over the cap. */
export async function readCapped(stream, maxBytes, declaredLength = null) {
  if (declaredLength !== null && Number(declaredLength) > maxBytes) return null;
  if (!stream) return new Uint8Array(0);
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return all;
}

/* Parses a JSON object body (and, if allowed, a urlencoded form) under a byte cap.
   Returns { body } or { error: 400 | 413 | 415 }. */
export async function readBody(request, { maxBytes, allowForm = false }) {
  const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  const isJson = type === "application/json";
  const isForm = allowForm && type === "application/x-www-form-urlencoded";
  if (!isJson && !isForm) return { error: 415 };

  const bytes = await readCapped(request.body, maxBytes, request.headers.get("Content-Length"));
  if (bytes === null) return { error: 413 };
  const text = new TextDecoder().decode(bytes);

  if (isJson) {
    try {
      const obj = JSON.parse(text);
      return obj && typeof obj === "object" && !Array.isArray(obj) ? { body: obj } : { error: 400 };
    } catch {
      return { error: 400 };
    }
  }
  return { body: Object.fromEntries(new URLSearchParams(text)) };
}

export function bodyError(error) {
  if (error === 413) return json({ ok: false, error: "Request is too large." }, 413);
  if (error === 415) return json({ ok: false, error: "Unsupported content type." }, 415);
  return json({ ok: false, error: "Malformed request." }, 400);
}
