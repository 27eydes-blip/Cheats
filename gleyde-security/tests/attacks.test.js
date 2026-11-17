/* Attack suite for POST /api/contact, run directly against the Pages Function handler.
   Each test is an attack we tried; the assertion is the safe outcome.
   Network calls (Turnstile, Resend) are replaced with a recording mock. */
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { _resetRateLimitMemory, onRequest, onRequestPost, rateLimitSubject } from "../functions/api/contact.js";

const cp = (...n) => String.fromCodePoint(...n);
const ORIGIN = "https://site.test";

function makeKv({ delayMs = 0, fail = false } = {}) {
  const m = new Map();
  const wait = () => new Promise((r) => setTimeout(r, delayMs));
  return {
    get: async (k) => { if (fail) throw new Error("kv down"); await wait(); return m.get(k) ?? null; },
    put: async (k, v) => { if (fail) throw new Error("kv down"); await wait(); m.set(k, v); },
  };
}
const baseEnv = (over = {}) => ({
  TURNSTILE_SECRET_KEY: "live-secret", RESEND_API_KEY: "re_test",
  CONTACT_TO_EMAIL: "owner@example.com", CONTACT_FROM_EMAIL: "Site <site@example.com>",
  RATE_LIMIT_KV: makeKv(), RATE_LIMIT_SALT: "salt", ...over,
});
const good = () => ({
  name: "Jane Doe", email: "jane@example.com", website: "example.com",
  message: "Please check my website.", consent: true, company_fax: "",
  started_at: String(Date.now() - 10_000), "cf-turnstile-response": "tok",
});

let calls;
let turnstileReply;
function installFetch() {
  calls = [];
  turnstileReply = { success: true, action: "contact", hostname: "site.test" };
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("turnstile")) return Response.json(turnstileReply);
    return new Response("{}", { status: 200 });
  };
}
const emails = () => calls.filter((c) => c.url.includes("resend")).map((c) => JSON.parse(c.init.body));

let ipCounter = 0;
function post(body, { headers = {}, raw, type = "application/json", ip } = {}) {
  return new Request(`${ORIGIN}/api/contact`, {
    method: "POST",
    body: raw ?? (type === "application/json" ? JSON.stringify(body) : new URLSearchParams(body).toString()),
    headers: {
      "Content-Type": type, Accept: "application/json", Origin: ORIGIN,
      "CF-Connecting-IP": ip ?? `192.0.2.${(ipCounter++ % 250) + 1}`, ...headers,
    },
  });
}
const send = (req, env = baseEnv()) => onRequestPost({ request: req, env });

beforeEach(() => {
  _resetRateLimitMemory();
  installFetch();
});

/* ------------------------------------------------------------------ */
describe("XSS payloads in every field", () => {
  const payloads = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "\"><svg/onload=alert(1)>",
    "javascript:alert(1)",
    "<iframe srcdoc='<script>alert(1)</script>'>",
    "{{constructor.constructor('alert(1)')()}}",
    "${alert(1)}",
    "</textarea><script>alert(1)</script>",
  ];

  for (const p of payloads) {
    test(`message/name payload is stored only as plain text: ${p.slice(0, 30)}`, async () => {
      const res = await send(post({ ...good(), name: `Jane ${p}`.slice(0, 100), message: `Hello ${p}` }));
      assert.equal(res.status, 200);
      const [mail] = emails();
      assert.equal(mail.html, undefined, "no HTML body is ever sent");
      assert.ok(mail.text.includes(p), "payload kept verbatim as inert text");
      assert.equal(mail.subject, "New website inquiry");
    });
  }

  test("response bodies never echo user input (no reflected XSS)", async () => {
    const p = "<script>alert(1)</script>";
    for (const body of [
      { ...good(), name: p, email: p, website: p, message: p },
      { ...good(), name: "x" }, // validation failure path
    ]) {
      const res = await send(post(body));
      const text = await res.text();
      assert.ok(!text.includes("<script"), `reflected: ${text}`);
      assert.match(res.headers.get("Content-Type"), /^application\/json/);
      assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
    }
  });

  test("website field rejects script and data URLs", async () => {
    for (const w of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "file:///etc/passwd"]) {
      const res = await send(post({ ...good(), website: w }));
      assert.equal(res.status, 422, w);
      assert.ok((await res.json()).fields.website, w);
    }
  });

  test("email field rejects markup", async () => {
    const res = await send(post({ ...good(), email: "<script>@x.com" }));
    assert.equal(res.status, 422);
  });
});

/* ------------------------------------------------------------------ */
describe("Email header injection", () => {
  const injections = [
    "jane@example.com\r\nBcc: victim@evil.test",
    "jane@example.com\nBcc: victim@evil.test",
    "jane@example.com%0d%0aBcc:victim@evil.test",
    `jane@example.com${cp(0x2028)}Bcc: victim@evil.test`,
    `jane@example.com${cp(0x85)}Bcc: victim@evil.test`,
    "jane@example.com, victim@evil.test",
    "jane@example.com;victim@evil.test",
    "\"Jane\" <jane@example.com>",
    "jane@example.com\u0000",
  ];
  for (const email of injections) {
    test(`email ${JSON.stringify(email).slice(0, 40)} cannot add recipients`, async () => {
      const res = await send(post({ ...good(), email }));
      if (res.status === 200) {
        const [mail] = emails();
        assert.match(mail.reply_to, /^[a-z0-9._%+-]+@[a-z0-9.-]+$/);
        assert.ok(!/bcc|evil/i.test(JSON.stringify({ to: mail.to, reply_to: mail.reply_to })));
      } else {
        assert.equal(res.status, 422);
        assert.equal(emails().length, 0);
      }
    });
  }

  test("CRLF and Unicode line breaks in name never reach headers or split lines", async () => {
    const name = `Jane\r\nBcc: x@evil.test${cp(0x2028)}Subject: hacked${cp(0x85)}`;
    const res = await send(post({ ...good(), name }));
    assert.equal(res.status, 200);
    const [mail] = emails();
    assert.equal(mail.subject, "New website inquiry");
    assert.deepEqual(mail.to, ["owner@example.com"]);
    const nameLine = mail.text.split("\n").find((l) => l.startsWith("Name:"));
    assert.ok(nameLine.includes("Bcc: x@evil.test"), "kept on the one Name line as text");
    assert.ok(!mail.text.includes("\nBcc:"));
  });

  test("bidi overrides and zero-width characters are stripped", async () => {
    const name = `Jane${cp(0x202e)}eod${cp(0x200b)}${cp(0x2066)}${cp(0xfeff)}`;
    await send(post({ ...good(), name }));
    assert.match(emails()[0].text, /Name: {4}Janeeod\n/);
  });
});

/* ------------------------------------------------------------------ */
describe("Oversized and malformed requests", () => {
  test("declared Content-Length over 16 KB is refused before reading", async () => {
    const req = post(null, { raw: "{}", headers: { "Content-Length": "999999999" } });
    assert.equal((await send(req)).status, 413);
  });

  test("chunked body with no Content-Length is cut off at 16 KB (streamed)", async () => {
    let pulled = 0;
    const stream = new ReadableStream({
      pull(c) { pulled++; c.enqueue(new Uint8Array(4096).fill(97)); if (pulled > 2000) c.close(); },
    });
    const req = new Request(`${ORIGIN}/api/contact`, {
      method: "POST", body: stream, duplex: "half",
      headers: { "Content-Type": "application/json", Accept: "application/json", Origin: ORIGIN, "CF-Connecting-IP": "192.0.2.200" },
    });
    assert.equal((await send(req)).status, 413);
    assert.ok(pulled < 10, `read ${pulled} chunks; should stop right after 16 KB`);
  });

  test("16 KB body of valid JSON with a huge field is refused", async () => {
    assert.equal((await send(post({ ...good(), message: "a".repeat(20_000) }))).status, 413);
  });

  test("4,001-char message under the byte cap is refused by validation", async () => {
    assert.equal((await send(post({ ...good(), message: "a".repeat(4001) }))).status, 422);
  });

  const malformed = [
    ["invalid JSON", "{name:"],
    ["JSON array", "[1,2,3]"],
    ["JSON null", "null"],
    ["JSON string", "\"hello\""],
    ["JSON number", "42"],
    ["empty body", ""],
    ["deep nesting", "[".repeat(5000) + "]".repeat(5000)],
    ["invalid UTF-8", new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])],
  ];
  for (const [label, raw] of malformed) {
    test(`malformed: ${label} -> generic 400, no stack trace`, async () => {
      const res = await send(post(null, { raw }));
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.deepEqual(body, { ok: false, error: "Malformed request." });
    });
  }

  for (const type of ["text/plain", "multipart/form-data; boundary=x", "application/xml", ""]) {
    test(`content-type ${JSON.stringify(type)} -> 415`, async () => {
      assert.equal((await send(post(null, { raw: "{}", type }))).status, 415);
    });
  }

  test("type confusion: objects/arrays/numbers in fields fail validation", async () => {
    const res = await send(post({ ...good(), name: { toString: "x" }, message: ["a".repeat(20)], email: 5 }));
    assert.equal(res.status, 422);
    const { fields } = await res.json();
    assert.ok(fields.name && fields.message && fields.email);
    assert.equal(calls.length, 0, "never reached Turnstile or email");
  });

  test("prototype pollution keys are inert", async () => {
    const raw = '{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}},"name":"Jane Doe"}';
    await send(post(null, { raw }));
    assert.equal({}.polluted, undefined);
    assert.equal(Object.prototype.polluted, undefined);
  });

  test("other HTTP methods -> 405 with security headers", async () => {
    for (const method of ["GET", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]) {
      const res = onRequest({ request: new Request(`${ORIGIN}/api/contact`, { method }) });
      assert.equal(res.status, 405);
      assert.equal(res.headers.get("X-Frame-Options"), "DENY");
    }
  });

  test("internal failure returns a generic 500, not a stack trace", async () => {
    const env = baseEnv();
    env.CONTACT_TO_EMAIL = { split() { throw new Error("SECRET internal detail at /srv/app.js:42"); } };
    const res = await send(post(good()), env);
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.ok(!/SECRET|at \/|\.js:\d/.test(text), text);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
  });

  test("no-JS form post redirects only to /contact (no open redirect)", async () => {
    const req = new Request(`${ORIGIN}/api/contact?next=https://evil.test`, {
      method: "POST",
      body: new URLSearchParams({ ...good(), consent: "on" }).toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN, Referer: "https://evil.test/", "CF-Connecting-IP": "192.0.2.201" },
    });
    const res = await send(req);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), "/contact?status=sent");
  });
});

/* ------------------------------------------------------------------ */
describe("CORS and origin tricks", () => {
  const hostile = [
    "https://evil.test",
    "null",
    "https://site.test.evil.test",
    "https://evil.test/https://site.test",
    "https://site.test@evil.test",
    "http://site.test", // scheme downgrade
    "https://site.test:8443", // other port
    "https://sub.site.test", // subdomain not on allow-list
    "HTTPS://SITE.TEST.evil.test",
  ];
  for (const origin of hostile) {
    test(`Origin ${origin} -> 403, nothing sent`, async () => {
      const res = await send(post(good(), { headers: { Origin: origin } }));
      assert.equal(res.status, 403);
      assert.equal(calls.length, 0);
      assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
    });
  }

  test("no Origin but Sec-Fetch-Site: cross-site -> 403", async () => {
    const req = post(good(), { headers: { "Sec-Fetch-Site": "cross-site" } });
    req.headers.delete("Origin");
    assert.equal((await send(req)).status, 403);
  });

  test("allowed origin from ALLOWED_ORIGINS is accepted; others still refused", async () => {
    const env = baseEnv({ ALLOWED_ORIGINS: "https://www.site.test, https://site.test" });
    assert.equal((await send(post(good(), { headers: { Origin: "https://www.site.test" } }), env)).status, 200);
    assert.equal((await send(post(good(), { headers: { Origin: "https://www.site.test.evil.test" } }), env)).status, 403);
  });

  test("ALLOWED_ORIGINS='*' does not become a wildcard", async () => {
    const env = baseEnv({ ALLOWED_ORIGINS: "*" });
    assert.equal((await send(post(good(), { headers: { Origin: "https://evil.test" } }), env)).status, 403);
  });

  test("successful responses carry no CORS grant", async () => {
    const res = await send(post(good()));
    assert.equal(res.status, 200);
    for (const h of ["Access-Control-Allow-Origin", "Access-Control-Allow-Credentials"]) assert.equal(res.headers.get(h), null);
  });
});

/* ------------------------------------------------------------------ */
describe("Rate-limit bypass attempts", () => {
  async function burst(n, ipFor, opts = {}) {
    const env = opts.env || baseEnv();
    const statuses = [];
    for (let i = 0; i < n; i++) statuses.push((await send(post(opts.body || good(), { ip: ipFor(i), headers: opts.headers?.(i) }), env)).status);
    return statuses;
  }
  const blocked = (s) => s.filter((x) => x === 429).length;

  test("baseline: 6th post from one IPv4 is blocked", async () => {
    const s = await burst(6, () => "198.51.100.10");
    assert.deepEqual(s, [200, 200, 200, 200, 200, 429]);
  });

  test("spoofed X-Forwarded-For / X-Real-IP / True-Client-IP are ignored", async () => {
    const s = await burst(8, () => "198.51.100.11", {
      headers: (i) => ({ "X-Forwarded-For": `10.0.0.${i}`, "X-Real-IP": `10.1.0.${i}`, "True-Client-IP": `10.2.0.${i}` }),
    });
    assert.equal(blocked(s), 3);
  });

  test("rotating IPv6 addresses inside one /64 is blocked (was a bypass)", async () => {
    const s = await burst(8, (i) => `2001:db8:abcd:12::${(i + 1).toString(16)}`);
    assert.equal(blocked(s), 3);
  });

  test("different textual forms of the same IPv6 /64 count together", async () => {
    const forms = [
      "2001:db8:abcd:12::1", "2001:0DB8:ABCD:0012:0000:0000:0000:0002", "2001:db8:abcd:12:0:0:0:3",
      "2001:db8:abcd:12::4%eth0", "2001:db8:abcd:12:ffff::5", "2001:db8:abcd:12::6",
    ];
    const s = await burst(6, (i) => forms[i]);
    assert.equal(s[5], 429);
  });

  test("IPv4-mapped IPv6 counts as the same IPv4", async () => {
    const s = await burst(6, (i) => (i % 2 ? "::ffff:198.51.100.12" : "198.51.100.12"));
    assert.equal(s[5], 429);
  });

  test("different /64s are limited separately (no collateral blocking)", async () => {
    const s = await burst(6, (i) => `2001:db8:abcd:${i}::1`);
    assert.equal(blocked(s), 0);
  });

  test("parallel burst cannot race past the limit (was a bypass with KV alone)", async () => {
    const env = baseEnv({ RATE_LIMIT_KV: makeKv({ delayMs: 20 }) });
    const res = await Promise.all(Array.from({ length: 15 }, () => send(post(good(), { ip: "198.51.100.13" }), env)));
    const s = res.map((r) => r.status);
    assert.equal(s.filter((x) => x === 200).length, 5, `statuses: ${s}`);
    assert.equal(blocked(s), 10);
  });

  test("malformed and invalid posts count toward the limit too (was not counted)", async () => {
    const env = baseEnv();
    for (let i = 0; i < 5; i++) await send(post(null, { raw: "not json", ip: "198.51.100.14" }), env);
    assert.equal((await send(post(good(), { ip: "198.51.100.14" }), env)).status, 429);
  });

  test("missing CF-Connecting-IP shares one bucket rather than being unlimited", async () => {
    const s = await burst(6, () => "");
    assert.equal(s[5], 429);
  });

  test("KV outage fails open but the in-memory limit still holds", async () => {
    const env = baseEnv({ RATE_LIMIT_KV: makeKv({ fail: true }) });
    const s = await burst(6, () => "198.51.100.15", { env });
    assert.deepEqual(s, [200, 200, 200, 200, 200, 429]);
  });

  test("rateLimitSubject normalizes as expected", () => {
    assert.equal(rateLimitSubject("2001:DB8::1"), "2001:0db8:0000:0000::/64");
    assert.equal(rateLimitSubject("::ffff:1.2.3.4"), "1.2.3.4");
    assert.equal(rateLimitSubject("64:ff9b::1.2.3.4"), "0064:ff9b:0000:0000::/64");
    assert.equal(rateLimitSubject(""), "unknown");
  });
});

/* ------------------------------------------------------------------ */
describe("Spam-trap and Turnstile bypass attempts", () => {
  test("omitting started_at no longer skips the time trap (was a bypass)", async () => {
    const body = good();
    delete body.started_at;
    const res = await send(post(body));
    assert.equal(res.status, 200, "fake success so bots don't adapt");
    assert.equal(calls.length, 0, "silently dropped");
  });

  for (const v of ["abc", "", "0", "-5", String(Date.now()), String(Date.now() + 60_000)]) {
    test(`started_at=${JSON.stringify(v).slice(0, 20)} is treated as a bot`, async () => {
      await send(post({ ...good(), started_at: v }));
      assert.equal(calls.length, 0);
    });
  }

  test("filled honeypot is silently dropped", async () => {
    const res = await send(post({ ...good(), company_fax: "555-0100" }));
    assert.equal(res.status, 200);
    assert.equal(calls.length, 0);
  });

  test("missing / oversized / non-string Turnstile token is refused without calling Cloudflare", async () => {
    for (const tok of [undefined, "", "x".repeat(3000), { a: 1 }, ["tok"]]) {
      installFetch();
      const res = await send(post({ ...good(), "cf-turnstile-response": tok }));
      assert.equal(res.status, 403);
      assert.equal(calls.length, 0);
    }
  });

  test("token solved on another hostname is refused (was accepted)", async () => {
    turnstileReply = { success: true, action: "contact", hostname: "evil.test" };
    assert.equal((await send(post(good()))).status, 403);
    assert.equal(emails().length, 0);
  });

  test("token for a different widget action is refused; missing action is refused", async () => {
    for (const action of ["login", "", undefined]) {
      installFetch();
      turnstileReply = { success: true, action, hostname: "site.test" };
      assert.equal((await send(post(good()))).status, 403);
    }
  });

  test("Cloudflare's public test secret still works for local development", async () => {
    turnstileReply = { success: true, hostname: "example.com" };
    const env = baseEnv({ TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA" });
    assert.equal((await send(post(good()), env)).status, 200);
  });

  test("missing secret key fails closed", async () => {
    const env = baseEnv({ TURNSTILE_SECRET_KEY: "" });
    assert.equal((await send(post(good()), env)).status, 403);
    assert.equal(emails().length, 0);
  });
});
