// Security fixes from the overnight review: other websites and DNS tricks can't drive Jericho,
// other devices need the token, broken URLs can't hang requests, Claude Code doesn't get the
// keys, symlinks and Windows path tricks can't escape the allowed folders, and more.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jericho-sec-")));
const desktop = path.join(tmp, "Desktop");
const outside = path.join(tmp, "outside");
fs.mkdirSync(desktop);
fs.mkdirSync(outside);
const fakeClaude = path.join(tmp, "fake-claude.mjs");
fs.writeFileSync(
  fakeClaude,
  `#!/usr/bin/env node
const leaked = ["ELEVENLABS_API_KEY", "TWILIO_AUTH_TOKEN", "JERICHO_ACCESS_TOKEN", "CALENDAR_ICS_URL", "ROKU_IP"].filter((k) => process.env[k]);
console.log(JSON.stringify({ result: "Done.\\nSUMMARY: leaked=" + leaked.join(",") + " key el-secret-value-123456 ok" }));`,
);
fs.chmodSync(fakeClaude, 0o755);
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
const settingsFile = path.join(tmp, "settings.json");
fs.writeFileSync(
  settingsFile,
  JSON.stringify({
    ...base,
    logFile: path.join(tmp, "actions.log"),
    pc: { ...base.pc, allowedFolders: [desktop] },
    claudeCode: { ...base.claudeCode, path: "", command: fakeClaude, projectsDir: path.join(tmp, "projects") },
  }),
);
Object.assign(process.env, {
  JERICHO_SETTINGS: settingsFile,
  JERICHO_DATA_DIR: path.join(tmp, "data"),
  ELEVENLABS_API_KEY: "el-secret-value-123456",
  TWILIO_AUTH_TOKEN: "twilio-secret-987654",
  CALENDAR_ICS_URL: "https://calendar.example.com/private-zzz/basic.ics",
  ROKU_IP: "192.168.1.50",
});

const { checkApiRequest, isAllowedHost } = await import("../server/guard.js");
const { resolvePath, hasWindowsPathTricks } = await import("../server/pc/policy.js");
const { cleanEnv } = await import("../server/tools/pc.js");
const { claudeEnv, claudeCodeTool, jobEvents } = await import("../server/tools/claudeCode.js");
const { isLocalAddress } = await import("../server/roku/ecp.js");
const { alarms } = await import("../server/alarms/manager.js");
const { isRisky, tools } = await import("../server/tools/index.js");

test("other websites, DNS rebinding and (without a token) other devices are refused", () => {
  const ok = (h, extra) => checkApiRequest({ headers: { host: "localhost:3000", ...h }, remoteAddress: "127.0.0.1", hasToken: false, ...extra });
  assert.equal(ok({}), null, "this PC, no token: fine");
  assert.equal(ok({ origin: "http://localhost:3000", "sec-fetch-site": "same-origin" }), null, "the page itself");
  assert.equal(ok({ origin: "https://evil.example" }).status, 403, "another website");
  assert.equal(ok({ "sec-fetch-site": "cross-site" }).status, 403);
  assert.equal(ok({ "sec-fetch-site": "same-site" }).status, 403);
  assert.equal(ok({ origin: "null" }).status, 403, "sandboxed frames and files");
  // DNS rebinding: evil.example resolves to 127.0.0.1, so the Origin matches the Host
  assert.equal(ok({ host: "evil.example:3000", origin: "http://evil.example:3000" }).status, 403);
  assert.equal(ok({ host: "evil.example:3000" }).status, 403);
  // without a token, only this PC; with a token, other devices go on to the token check
  assert.equal(ok({ host: "192.168.1.20:3000" }, { remoteAddress: "192.168.1.33" }).status, 401);
  assert.equal(ok({ host: "192.168.1.20:3000" }, { remoteAddress: "::ffff:192.168.1.33", hasToken: true }), null);
  assert.equal(ok({ host: "jericho.home.example" }, { extraHosts: ["jericho.home.example"] }), null, "allowedHosts in settings");
  for (const h of ["100.101.12.7:3000", "laptop.tail1234.ts.net", "localhost", "127.0.0.1:3000", "[::1]:3000", "192.168.0.5", "10.1.2.3:443", os.hostname()]) assert.equal(isAllowedHost(h), true, h);
  for (const h of ["", "8.8.8.8", "example.com", "localhost.evil.com", "ts.net.evil.com", "100.12.0.1"]) assert.equal(isAllowedHost(h), false, h);
});

test("the real server: a cross-site request is refused and a broken URL gets 400 instead of hanging", async () => {
  const port = 3900 + Math.floor(Math.random() * 90);
  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, PORT: String(port), JERICHO_SKIP_SELFTEST: "1", JERICHO_ACCESS_TOKEN: "", JERICHO_NO_ENV_FILE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise((resolve, reject) => {
      server.stdout.on("data", (d) => /is running/.test(d) && resolve());
      server.on("exit", (c) => reject(new Error(`server exited ${c}`)));
      setTimeout(() => reject(new Error("server didn't start")), 15_000);
    });
    const url = (p) => `http://127.0.0.1:${port}${p}`;
    assert.equal((await fetch(url("/api/config"))).status, 200);
    const evil = await fetch(url("/api/memory/wipe"), { method: "POST", headers: { origin: "https://evil.example", "content-type": "text/plain" }, body: "{}" });
    assert.equal(evil.status, 403);
    for (const p of ["/%E0%A4%A", "/vendor/three/%E0%A4%A"]) {
      const r = await fetch(url(p), { signal: AbortSignal.timeout(3000) });
      assert.equal(r.status, 400, p);
    }
    assert.equal((await fetch(url("/"))).status, 200, "still serving after the bad requests");
  } finally {
    server.kill();
  }
});

test("Claude Code gets none of Jericho's keys, and its summary is scrubbed before it's spoken", async () => {
  const env = claudeEnv();
  for (const k of ["ELEVENLABS_API_KEY", "TWILIO_AUTH_TOKEN", "CALENDAR_ICS_URL", "ROKU_IP", "JERICHO_ACCESS_TOKEN"]) assert.equal(env[k], undefined, k);
  assert.equal(cleanEnv().ROKU_IP, undefined);
  const said = new Promise((resolve) => jobEvents.once("announce", resolve));
  await claudeCodeTool.run({ folder: "demo", task: "do it" });
  const text = await said;
  assert.match(text, /leaked=( |$)/, `no keys in its environment: ${text}`);
  assert.doesNotMatch(text, /el-secret-value-123456/, "an env value in the summary is blanked");
});

test("symlinks can't escape the allowed folders, even through folders that don't exist yet", () => {
  fs.symlinkSync(outside, path.join(desktop, "link"));
  assert.equal(resolvePath("Desktop/link/x.txt").ok, false);
  assert.equal(resolvePath("Desktop/link/newdir/deeper/x.txt").ok, false, "missing folders under the link");
  assert.equal(resolvePath("Desktop/newdir/x.txt").ok, true, "a normal new folder is fine");
  // Windows: alternate data streams and 8.3 short names
  for (const p of ["Cheats/jericho/.env::$DATA", "Documents/server.key:hidden", "Cheats/jericho/ENV~1", "GIT~1/config"]) assert.equal(hasWindowsPathTricks(p), true, p);
  for (const p of ["C:\\Users\\me\\Desktop\\notes.txt", "Desktop/my~notes.txt", "\\\\?\\C:\\Users\\a.txt"]) assert.equal(hasWindowsPathTricks(p), false, p);
});

test("cancelling alarms is your own data (no yes); the TV check can't be fooled by leading zeros", async () => {
  alarms.clock = () => new Date("2026-11-23T14:00:00Z");
  await alarms.set({ time: "7am", label: "meds" });
  await alarms.set({ time: "8am", label: "gym" });
  await alarms.set({ time: "9am", label: "dentist" });
  assert.equal(isRisky("cancel_alarm", { which: "e" }), false, "several labels, still your own alarms");
  assert.equal(isRisky("cancel_alarm", { which: "gym" }), false, "just one");
  assert.equal(isRisky("cancel_alarm", { which: "2" }), false);
  for (const ip of ["010.0.0.1", "192.168.01.5", "0192.168.1.5"]) assert.equal(isLocalAddress(ip), false, ip);
  assert.equal(isLocalAddress("10.0.0.1"), true);
});
