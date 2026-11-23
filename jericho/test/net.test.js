// The keep-alive pool falls back to Node's built-in fetch when the pool itself is broken,
// and errors are logged with their real cause.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-net-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log") }));
process.env.JERICHO_SETTINGS = path.join(tmp, "settings.json");

const net = await import("../server/net.js");
const log = () => (fs.existsSync(path.join(tmp, "actions.log")) ? fs.readFileSync(path.join(tmp, "actions.log"), "utf8") : "");

// What Node 26 threw for the old setup: "fetch failed", caused by "invalid onError method".
const brokenPoolError = () =>
  new TypeError("fetch failed", { cause: Object.assign(new Error("invalid onError method"), { code: "UND_ERR_INVALID_ARG" }) });

test("errorDetails follows the cause chain", () => {
  const chain = net.errorDetails(brokenPoolError());
  assert.equal(chain[0].message, "fetch failed");
  assert.equal(chain[1].code, "UND_ERR_INVALID_ARG");
  assert.equal(net.errorSummary(brokenPoolError()), "fetch failed  <-  UND_ERR_INVALID_ARG invalid onError method");
});

test("network down: the error comes through and the pool is kept", async () => {
  let poolCalls = 0;
  net._setPoolForTests({ fetch: async () => { poolCalls++; throw new TypeError("fetch failed", { cause: Object.assign(new Error("getaddrinfo ENOTFOUND x"), { code: "ENOTFOUND" }) }); }, agent: {} });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError("fetch failed", { cause: Object.assign(new Error("getaddrinfo ENOTFOUND x"), { code: "ENOTFOUND" }) }); };
  try {
    await assert.rejects(net.keepAliveFetch("https://example.test/"), /fetch failed/);
    assert.equal(net.connectionMode(), "keep-alive pool");
    assert.doesNotMatch(log(), /net_fallback/);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(poolCalls, 1);
});

test("broken pool: falls back to the built-in fetch, logs it once, and stays there", async () => {
  let poolCalls = 0;
  let builtinCalls = 0;
  net._setPoolForTests({ fetch: async () => { poolCalls++; throw brokenPoolError(); }, agent: {} });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { builtinCalls++; return new Response("ok", { status: 200 }); };
  try {
    const r1 = await net.keepAliveFetch("https://example.test/a");
    const r2 = await net.keepAliveFetch("https://example.test/b");
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(poolCalls, 1, "the pool isn't tried again after it failed");
  assert.equal(builtinCalls, 2);
  assert.match(net.connectionMode(), /^built-in fetch \(fetch failed {2}<- {2}UND_ERR_INVALID_ARG invalid onError method\)$/);
  const lines = log().split("\n").filter((l) => l.includes('"type":"net_fallback"'));
  assert.equal(lines.length, 1, "logged once");
  assert.match(lines[0], /UND_ERR_INVALID_ARG/);
});
