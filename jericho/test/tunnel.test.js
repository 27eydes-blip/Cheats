// Real phone calls through a public tunnel: the access-token gate, Twilio signature checks,
// rate limits on the webhooks, and the setup helper (which must never print a secret).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-tunnel-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
const PUBLIC = "https://jericho-test.example.com";
const TWILIO_TOKEN = "a".repeat(32);
const ACCESS = "correct-horse-battery-staple-42";
const settingsFile = path.join(tmp, "settings.json");
fs.writeFileSync(
  settingsFile,
  JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log"), calls: { ...base.calls, testMode: false, publicUrl: PUBLIC, webhookRequestsPerMinute: 8 } }),
);
Object.assign(process.env, { JERICHO_SETTINGS: settingsFile, JERICHO_DATA_DIR: path.join(tmp, "data"), JERICHO_NO_ENV_FILE: "1", TWILIO_AUTH_TOKEN: TWILIO_TOKEN });

const { createTunnelGate, createWebhookLimiter, viaTunnel, tokenProof, pageCookieValue, clientAddress, isTwilioRoute } = await import("../server/tunnel.js");
const { RateLimiter } = await import("../server/ratelimit.js");
const { validTwilioSignature } = await import("../server/calls/manager.js");
const { checkCallSetup, consoleSteps, checkTunnel } = await import("../scripts/calls-setup.mjs");

/** Twilio's signature: HMAC-SHA1 of the full URL plus the sorted POST parameters. */
function sign(url, params = {}, token = TWILIO_TOKEN) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return crypto.createHmac("sha1", token).update(data).digest("base64");
}

// ---- the token gate ----------------------------------------------------------------------------------

const tunnelHeaders = { host: "jericho-test.example.com", "x-forwarded-for": "198.51.100.7" };

test("a request through the tunnel is told apart from this PC and the home network", () => {
  assert.equal(viaTunnel({ host: "jericho-test.example.com" }, { publicUrl: PUBLIC }), true, "the tunnel's own name");
  assert.equal(viaTunnel({ host: "localhost:3000", "x-forwarded-for": "198.51.100.7" }, { publicUrl: PUBLIC }), true, "a tunnel that rewrites Host to localhost still adds forwarding headers");
  assert.equal(viaTunnel({ host: "localhost:3000", "cf-connecting-ip": "1.2.3.4" }), true);
  assert.equal(viaTunnel({ host: "someone-else.example" }), true, "any outside name");
  // Tailscale Funnel makes a *.ts.net name public: once it's calls.publicUrl, it counts as the tunnel
  assert.equal(viaTunnel({ host: "laptop.tail1234.ts.net" }, { publicUrl: "https://laptop.tail1234.ts.net" }), true);
  assert.equal(viaTunnel({ host: "localhost:3000" }, { publicUrl: PUBLIC }), false);
  assert.equal(viaTunnel({ host: "192.168.1.20:3000" }, { publicUrl: PUBLIC }), false);
  assert.equal(clientAddress({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" }, "127.0.0.1"), "198.51.100.7");
  assert.equal(clientAddress({}, "::ffff:192.168.1.4"), "192.168.1.4");
});

test("through the tunnel, only Twilio's routes skip the token; everything else needs it", () => {
  const gate = createTunnelGate();
  const check = (pathname, extra = {}) => gate.check({ headers: tunnelHeaders, remoteAddress: "127.0.0.1", pathname, searchParams: new URLSearchParams(), accessToken: ACCESS, publicUrl: PUBLIC, ...extra });
  for (const p of ["/twilio/voice", "/twilio/gather", "/twilio/status", `/twilio/audio/${"0".repeat(32)}`]) assert.equal(check(p), null, p);
  assert.equal(isTwilioRoute("/twilio/audio/../../etc"), false);
  assert.equal(isTwilioRoute("/twilio/other"), false);
  for (const p of ["/", "/memory", "/calls", "/app.js", "/api/config", "/api/memory", "/api/memory/wipe", "/api/ask", "/api/control", "/api/stop", "/api/alarms", "/api/events", "/api/tts"]) {
    assert.equal(check(p)?.status, 401, p);
  }
  // with the token: in the header, or once in the address (the page then gets a cookie)
  assert.equal(check("/api/config", { headers: { ...tunnelHeaders, "x-jericho-token": ACCESS } }), null);
  const opened = check("/", { searchParams: new URLSearchParams({ token: ACCESS }) });
  assert.match(opened.setCookie, /^jericho_page=[\w-]+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=2592000$/);
  assert.ok(!opened.setCookie.includes(ACCESS), "the cookie isn't the token itself");
  const withCookie = { ...tunnelHeaders, cookie: `theme=dark; jericho_page=${pageCookieValue(ACCESS)}` };
  assert.equal(check("/app.js", { headers: withCookie }), null);
  assert.match(check("/", { searchParams: new URLSearchParams({ token: ACCESS }), secure: true }).setCookie, /; Secure$/);
  // a wrong token, a cookie made with another token, and a near miss are all refused
  assert.equal(check("/api/config", { headers: { ...tunnelHeaders, "x-jericho-token": `${ACCESS}x` } }).status, 401);
  assert.equal(check("/app.js", { headers: { ...tunnelHeaders, cookie: `jericho_page=${pageCookieValue("other")}` } }).status, 401);
  assert.equal(tokenProof({ "x-jericho-token": "" }, new URLSearchParams(), ACCESS), "");
  // the same requests from this PC aren't affected (the usual checks apply there)
  assert.equal(check("/", { headers: { host: "localhost:3000" } }), null);
});

test("through the tunnel with no access token set, everything but Twilio's routes is refused", () => {
  const gate = createTunnelGate();
  const check = (pathname, headers = tunnelHeaders) => gate.check({ headers, pathname, searchParams: new URLSearchParams({ token: "" }), accessToken: "", publicUrl: PUBLIC });
  for (const p of ["/", "/app.js", "/api/config", "/api/memory", "/api/ask"]) {
    const r = check(p);
    assert.equal(r.status, 403, p);
    assert.match(r.error, /needs JERICHO_ACCESS_TOKEN/);
  }
  assert.equal(check("/twilio/status"), null);
  assert.equal(check("/", { host: "localhost:3000" }), null, "this PC still works without a token");
});

test("guessing the token: 10 wrong tries in 10 minutes and that address is shut out", () => {
  let now = 0;
  const gate = createTunnelGate({ now: () => now });
  const tryToken = (t, ip = "198.51.100.7") => gate.check({ headers: { ...tunnelHeaders, "x-forwarded-for": ip, "x-jericho-token": t }, pathname: "/api/config", searchParams: new URLSearchParams(), accessToken: ACCESS, publicUrl: PUBLIC });
  for (let i = 0; i < 10; i++) assert.equal(tryToken(`guess${i}`).status, 401);
  assert.equal(tryToken("guess-again").status, 429);
  assert.equal(tryToken(ACCESS).status, 429, "even the right token waits once the address is blocked");
  assert.equal(tryToken(ACCESS, "203.0.113.50"), null, "other addresses aren't affected");
  now += 10 * 60_000 + 1;
  assert.equal(tryToken(ACCESS), null, "after 10 minutes it's allowed again");
});

// ---- Twilio signatures ------------------------------------------------------------------------------

test("Twilio signatures: right ones pass; missing, wrong, tampered or for another URL are rejected", () => {
  const url = `${PUBLIC}/twilio/gather?call=abc`;
  const params = { CallSid: "CA1", SpeechResult: "Yes, seven works" };
  assert.equal(validTwilioSignature(sign(url, params), url, params), true);
  assert.equal(validTwilioSignature(undefined, url, params), false, "unsigned");
  assert.equal(validTwilioSignature("", url, params), false);
  assert.equal(validTwilioSignature(sign(url, params, "b".repeat(32)), url, params), false, "signed with another account's token");
  assert.equal(validTwilioSignature(sign(url, params), url, { ...params, SpeechResult: "Cancel it" }), false, "body changed");
  assert.equal(validTwilioSignature(sign(url, params), `${PUBLIC}/twilio/gather?call=xyz`, params), false, "URL changed");
  assert.equal(validTwilioSignature(`${sign(url, params)}x`, url, params), false);
});

// ---- rate limits ---------------------------------------------------------------------------------------

test("the rate limiter counts per address over a sliding window", () => {
  let now = 1000;
  const rl = new RateLimiter({ limit: 3, windowMs: 1000, now: () => now });
  assert.ok(rl.hit("a").ok && rl.hit("a").ok && rl.hit("a").ok);
  const over = rl.hit("a");
  assert.equal(over.ok, false);
  assert.equal(over.retryAfterSeconds, 1);
  assert.ok(rl.hit("b").ok, "another address has its own count");
  now += 1001;
  assert.ok(rl.hit("a").ok, "the window moved on");
  const small = new RateLimiter({ limit: 1, windowMs: 1000, maxKeys: 3 });
  for (const k of ["1", "2", "3", "4", "5"]) small.hit(k);
  assert.ok(small.hits.size <= 3, "a flood of addresses can't grow it forever");
});

test("webhooks: requests per minute per address, and repeated bad signatures shut an address out", () => {
  let now = 0;
  const lim = createWebhookLimiter({ perMinute: 3, badSignatures: 2, now: () => now });
  assert.equal(lim.admit("1.1.1.1"), null);
  assert.equal(lim.admit("1.1.1.1"), null);
  assert.equal(lim.admit("1.1.1.1"), null);
  assert.equal(lim.admit("1.1.1.1").status, 429);
  assert.equal(lim.admit("2.2.2.2"), null);
  lim.badSignature("3.3.3.3");
  lim.badSignature("3.3.3.3");
  assert.equal(lim.admit("3.3.3.3").status, 429, "two bad signatures: blocked");
  now += 61_000;
  assert.equal(lim.admit("1.1.1.1"), null, "a minute later it's fine again");
  assert.equal(lim.admit("3.3.3.3").status, 429, "a bad-signature block lasts 10 minutes");
});

// ---- the real server ---------------------------------------------------------------------------------------

async function startServer(env) {
  const port = 4100 + Math.floor(Math.random() * 800);
  const proc = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), JERICHO_SKIP_SELFTEST: "1", JERICHO_NO_ENV_FILE: "1", ANTHROPIC_API_KEY: "", ELEVENLABS_API_KEY: "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    proc.stdout.on("data", (d) => /is running/.test(d) && resolve());
    proc.on("exit", (c) => reject(new Error(`server exited ${c}`)));
    setTimeout(() => reject(new Error("server didn't start")), 15_000);
  });
  /** A raw request (fetch can't set Host), as if it came through the tunnel unless headers say otherwise. */
  const request = (method, pathname, { headers = {}, body = "", tunnel = true } = {}) =>
    new Promise((resolve, reject) => {
      const h = tunnel ? { host: "jericho-test.example.com", "x-forwarded-for": "198.51.100.7", ...headers } : { host: `localhost:${port}`, ...headers };
      const req = http.request({ host: "127.0.0.1", port, method, path: pathname, headers: { ...h, "content-length": Buffer.byteLength(body) } }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      });
      req.on("error", reject);
      req.end(body);
    });
  return { proc, request, stop: () => proc.kill() };
}

const form = (params) => new URLSearchParams(params).toString();
const formHeaders = (sig, ip = "198.51.100.7") => ({ "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip, ...(sig ? { "x-twilio-signature": sig } : {}) });

test("the real server through the tunnel: the token gate", async () => {
  const s = await startServer({ JERICHO_ACCESS_TOKEN: ACCESS, TWILIO_AUTH_TOKEN: TWILIO_TOKEN });
  try {
    for (const p of ["/", "/memory", "/app.js", "/api/config", "/api/memory", "/api/control", "/api/calls"]) assert.equal((await s.request("GET", p)).status, 401, p);
    for (const p of ["/api/memory/wipe", "/api/stop", "/api/ask"]) assert.equal((await s.request("POST", p, { body: "{}" })).status, 401, p);
    // opening the page with the token once: a cookie for its scripts and styles
    const page = await s.request("GET", `/?token=${ACCESS}`);
    assert.equal(page.status, 200);
    const cookie = String(page.headers["set-cookie"]).split(";")[0];
    assert.match(cookie, /^jericho_page=/);
    assert.match(String(page.headers["set-cookie"]), /HttpOnly; SameSite=Strict; Max-Age=2592000; Secure/);
    assert.equal((await s.request("GET", "/app.js", { headers: { cookie } })).status, 200);
    // the API with the token in its header (as the page sends it)
    assert.equal((await s.request("GET", "/api/config", { headers: { "x-jericho-token": ACCESS } })).status, 200);
    assert.equal((await s.request("GET", "/api/config", { headers: { "x-jericho-token": "nope" } })).status, 401);
    // this PC, not through the tunnel, needs the token as before (it's set)
    assert.equal((await s.request("GET", "/", { tunnel: false })).status, 200, "the page itself");
    assert.equal((await s.request("GET", "/api/config", { tunnel: false })).status, 401);
    assert.equal((await s.request("GET", "/api/config", { tunnel: false, headers: { "x-jericho-token": ACCESS } })).status, 200);
  } finally {
    s.stop();
  }
});

test("the real server with no access token: through the tunnel only Twilio's routes answer", async () => {
  const s = await startServer({ JERICHO_ACCESS_TOKEN: "", TWILIO_AUTH_TOKEN: TWILIO_TOKEN });
  try {
    for (const p of ["/", "/app.js", "/memory", "/api/config", "/api/memory"]) {
      const r = await s.request("GET", p);
      assert.equal(r.status, 403, p);
      assert.match(r.body, /JERICHO_ACCESS_TOKEN/);
    }
    assert.equal((await s.request("POST", "/api/memory/wipe", { body: "{}" })).status, 403);
    // this PC keeps working exactly as before
    assert.equal((await s.request("GET", "/", { tunnel: false })).status, 200);
    assert.equal((await s.request("GET", "/api/config", { tunnel: false })).status, 200);
    // and a signed Twilio webhook still gets through
    const url = `${PUBLIC}/twilio/status?call=nothing`;
    const params = { CallSid: "CA1", CallStatus: "ringing" };
    assert.equal((await s.request("POST", "/twilio/status?call=nothing", { headers: formHeaders(sign(url, params)), body: form(params) })).status, 200);
  } finally {
    s.stop();
  }
});

test("the real server: every webhook needs a valid Twilio signature", async () => {
  const s = await startServer({ JERICHO_ACCESS_TOKEN: ACCESS, TWILIO_AUTH_TOKEN: TWILIO_TOKEN });
  try {
    for (const [i, route] of ["/twilio/voice", "/twilio/gather", "/twilio/status"].entries()) {
      const pathq = `${route}?call=abc`;
      const url = PUBLIC + pathq;
      const params = { CallSid: "CA9", CallStatus: "in-progress" };
      const ip = `203.0.113.${10 + i}`;
      assert.equal((await s.request("POST", pathq, { headers: formHeaders(null, ip), body: form(params) })).status, 403, `${route} unsigned`);
      assert.equal((await s.request("POST", pathq, { headers: formHeaders(sign(url, params, "b".repeat(32)), ip), body: form(params) })).status, 403, `${route} wrong key`);
      assert.equal((await s.request("POST", pathq, { headers: formHeaders(sign(url, params), ip), body: form({ ...params, CallStatus: "completed" }) })).status, 403, `${route} tampered`);
      const ok = await s.request("POST", pathq, { headers: formHeaders(sign(url, params), `198.51.100.${10 + i}`), body: form(params) });
      assert.equal(ok.status, 200, `${route} signed`);
      if (route !== "/twilio/status") assert.match(ok.body, /<Hangup\/>/, "an unknown call is hung up");
    }
    // a webhook can't be used with GET (Twilio posts), and the token never helps
    assert.equal((await s.request("GET", "/twilio/voice?call=abc", { headers: { "x-jericho-token": ACCESS, "x-forwarded-for": "192.0.2.77" } })).status, 403);
    // call audio: a wrong signature is refused; an id that isn't a live call is simply not found
    const audioPath = `/twilio/audio/${"0".repeat(32)}`;
    assert.equal((await s.request("GET", audioPath, { headers: { "x-twilio-signature": "bad", "x-forwarded-for": "192.0.2.78" } })).status, 403);
    assert.equal((await s.request("GET", audioPath, { headers: { "x-twilio-signature": sign(PUBLIC + audioPath), "x-forwarded-for": "192.0.2.79" } })).status, 404);
    const log = fs.readFileSync(path.join(tmp, "actions.log"), "utf8");
    assert.match(log, /"type":"twilio_rejected".*"reason":"unsigned"/);
    assert.ok(!log.includes(TWILIO_TOKEN) && !log.includes(ACCESS), "no secret in the log");
  } finally {
    s.stop();
  }
});

test("the real server: webhooks are rate limited, and bad signatures shut an address out", async () => {
  const s = await startServer({ JERICHO_ACCESS_TOKEN: ACCESS, TWILIO_AUTH_TOKEN: TWILIO_TOKEN });
  try {
    const url = `${PUBLIC}/twilio/status?call=x`;
    const params = { CallSid: "CA1", CallStatus: "ringing" };
    const statuses = [];
    for (let i = 0; i < 10; i++) statuses.push((await s.request("POST", "/twilio/status?call=x", { headers: formHeaders(sign(url, params), "198.51.100.200"), body: form(params) })).status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 200, 200, 429, 429], "8 a minute (webhookRequestsPerMinute in the test settings)");
    const limited = await s.request("POST", "/twilio/status?call=x", { headers: formHeaders(sign(url, params), "198.51.100.200"), body: form(params) });
    assert.ok(Number(limited.headers["retry-after"]) >= 1);
    // another address is unaffected; 5 bad signatures from one address block even its good ones
    assert.equal((await s.request("POST", "/twilio/status?call=x", { headers: formHeaders(sign(url, params), "198.51.100.201"), body: form(params) })).status, 200);
    for (let i = 0; i < 5; i++) assert.equal((await s.request("POST", "/twilio/status?call=x", { headers: formHeaders("forged", "198.51.100.202"), body: form(params) })).status, 403);
    assert.equal((await s.request("POST", "/twilio/status?call=x", { headers: formHeaders(sign(url, params), "198.51.100.202"), body: form(params) })).status, 429);
  } finally {
    s.stop();
  }
});

// ---- npm run calls:setup ---------------------------------------------------------------------------------------

const GOOD_ENV = {
  TWILIO_ACCOUNT_SID: `AC${"1234abcd".repeat(4)}`,
  TWILIO_AUTH_TOKEN: "9f".repeat(16),
  TWILIO_PHONE_NUMBER: "+15017122661",
  MY_PHONE_NUMBER: "+12125550187",
  JERICHO_ACCESS_TOKEN: "s3cret-access-token-value-xyz",
};

test("the setup helper checks the four Twilio values, the token and the public address", () => {
  const ok = checkCallSetup(GOOD_ENV, { publicUrl: PUBLIC, testMode: false });
  assert.deepEqual(ok.filter((r) => !r.ok), []);
  assert.deepEqual(ok.map((r) => r.name), ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "MY_PHONE_NUMBER", "JERICHO_ACCESS_TOKEN", "calls.publicUrl", "calls.testMode"]);
  const bad = checkCallSetup({ ...GOOD_ENV, TWILIO_AUTH_TOKEN: "", MY_PHONE_NUMBER: "555-0187", JERICHO_ACCESS_TOKEN: "short" }, { publicUrl: "http://localhost:3000", testMode: true });
  const failed = Object.fromEntries(bad.filter((r) => !r.ok).map((r) => [r.name, r.note]));
  assert.match(failed.TWILIO_AUTH_TOKEN, /missing/);
  assert.match(failed.MY_PHONE_NUMBER, /owner calls need it as \+1 and 10 digits/);
  assert.match(failed.JERICHO_ACCESS_TOKEN, /too short/);
  assert.match(failed["calls.publicUrl"], /https/);
  assert.match(failed["calls.testMode"], /simulated/);
  assert.match(checkCallSetup(GOOD_ENV, { publicUrl: "https://192.168.1.5", testMode: false }).find((r) => r.name === "calls.publicUrl").note, /home network/);
  assert.equal(checkCallSetup(GOOD_ENV, { publicUrl: "https://laptop.tail1234.ts.net", testMode: false }).find((r) => r.name === "calls.publicUrl").ok, true, "Tailscale Funnel");
  const steps = consoleSteps(PUBLIC).join("\n");
  assert.match(steps, /A call comes in: +Webhook +https:\/\/jericho-test\.example\.com\/twilio\/voice +HTTP POST/);
  assert.match(steps, /Call status changes: +https:\/\/jericho-test\.example\.com\/twilio\/status +HTTP POST/);
});

test("the setup helper never prints a key, token or phone number", async () => {
  const settingsCopy = path.join(tmp, "settings-setup.json");
  fs.writeFileSync(settingsCopy, JSON.stringify({ ...base, calls: { ...base.calls, testMode: false, publicUrl: PUBLIC } }));
  const out = await new Promise((resolve) => {
    const p = spawn(process.execPath, ["scripts/calls-setup.mjs", "--no-network"], { cwd: ROOT, env: { ...process.env, ...GOOD_ENV, JERICHO_SETTINGS: settingsCopy, JERICHO_NO_ENV_FILE: "1" } });
    let text = "";
    p.stdout.on("data", (d) => (text += d));
    p.stderr.on("data", (d) => (text += d));
    p.on("exit", (code) => resolve({ text, code }));
  });
  assert.equal(out.code, 0, out.text);
  assert.match(out.text, /Everything is in place/);
  assert.match(out.text, /twilio\/voice/);
  for (const v of Object.values(GOOD_ENV)) {
    assert.ok(!out.text.includes(v), "a secret value was printed");
    assert.ok(!out.text.includes(v.slice(-6)), "not even part of one");
  }
  // the tunnel check sends nothing secret and wants both requests refused
  const sent = [];
  const fakeFetch = async (url, init) => (sent.push({ url, init }), { status: String(url).endsWith("/twilio/voice") ? 403 : 401 });
  const tunnel = await checkTunnel(PUBLIC, fakeFetch);
  assert.ok(tunnel.every((r) => r.ok));
  assert.ok(!JSON.stringify(sent).includes(ACCESS) && !JSON.stringify(sent).includes(GOOD_ENV.JERICHO_ACCESS_TOKEN));
  const open = await checkTunnel(PUBLIC, async () => ({ status: 200 }));
  assert.ok(open.every((r) => !r.ok), "a tunnel that serves strangers is flagged");
});
