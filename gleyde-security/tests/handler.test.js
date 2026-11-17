import assert from "node:assert/strict";
import { test } from "node:test";
import { _resetRateLimitMemory, onRequestPost } from "../functions/api/contact.js";

function kv() {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) };
}
const env = () => ({
  TURNSTILE_SECRET_KEY: "secret", RESEND_API_KEY: "re_test",
  CONTACT_TO_EMAIL: "owner@example.com", CONTACT_FROM_EMAIL: "Site <site@example.com>",
  RATE_LIMIT_KV: kv(), RATE_LIMIT_SALT: "salt",
});
const body = { name: "Jane Doe", email: "jane@example.com", website: "", message: "Please check my website.",
  consent: true, company_fax: "", started_at: String(Date.now() - 10_000), "cf-turnstile-response": "tok" };
const req = (b = body, ip = "203.0.113.9") => new Request("https://site.test/api/contact", {
  method: "POST", body: JSON.stringify(b),
  headers: { "Content-Type": "application/json", Accept: "application/json", Origin: "https://site.test", "CF-Connecting-IP": ip },
});

function mockFetch({ turnstile = true, resend = true } = {}) {
  _resetRateLimitMemory();
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("turnstile")) return Response.json({ success: turnstile, action: "contact", hostname: "site.test" });
    return new Response("{}", { status: resend ? 200 : 500 });
  };
  return calls;
}

test("valid submission sends one plain-text email with fixed subject", async () => {
  const calls = mockFetch();
  const res = await onRequestPost({ request: req(), env: env() });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-Frame-Options"), "DENY");
  const mail = JSON.parse(calls.find((c) => c.url.includes("resend")).init.body);
  assert.equal(mail.subject, "New website inquiry");
  assert.equal(mail.reply_to, "jane@example.com");
  assert.equal(mail.html, undefined);
});

test("failed Turnstile blocks the email", async () => {
  const calls = mockFetch({ turnstile: false });
  const res = await onRequestPost({ request: req(), env: env() });
  assert.equal(res.status, 403);
  assert.ok(!calls.some((c) => c.url.includes("resend")));
});

test("email provider failure returns 502", async () => {
  mockFetch({ resend: false });
  assert.equal((await onRequestPost({ request: req(), env: env() })).status, 502);
});

test("rate limit: 6th message in an hour from one IP is refused", async () => {
  mockFetch();
  const e = env();
  for (let i = 0; i < 5; i++) assert.equal((await onRequestPost({ request: req(), env: e })).status, 200);
  const res = await onRequestPost({ request: req(), env: e });
  assert.equal(res.status, 429);
  assert.equal((await onRequestPost({ request: req(body, "198.51.100.1"), env: e })).status, 200);
});

test("too-fast submissions are silently dropped", async () => {
  const calls = mockFetch();
  const res = await onRequestPost({ request: req({ ...body, started_at: String(Date.now()) }), env: env() });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 0);
});

test("form-encoded post without JS redirects back to /contact", async () => {
  mockFetch();
  const r = new Request("https://site.test/api/contact", {
    method: "POST",
    body: new URLSearchParams({ ...body, consent: "on" }).toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://site.test" },
  });
  const res = await onRequestPost({ request: r, env: env() });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("Location"), "/contact?status=sent");
});
