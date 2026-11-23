// Offline tests: a fake Claude client drives the brain, so no API keys or money needed.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fakeClient, say, use } from "./fake-client.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-test-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
const settingsFile = path.join(tmp, "settings.json");
fs.writeFileSync(
  settingsFile,
  JSON.stringify({
    ...base,
    logFile: path.join(tmp, "actions.log"),
    claudeCode: { ...base.claudeCode, command: new URL("./fake-claude.mjs", import.meta.url).pathname, projectsDir: path.join(tmp, "projects") },
  }),
);
process.env.JERICHO_SETTINGS = settingsFile;
process.env.JERICHO_DATA_DIR = path.join(tmp, "data");

const { Brain } = await import("../server/brain.js");
const { isYes } = await import("../server/safety.js");
const { jobEvents, resolveProjectFolder } = await import("../server/tools/claudeCode.js");


test("safe tool runs straight away (mock lights)", async () => {
  const client = fakeClient([use("t1", "lights", { action: "on", room: "kitchen" }), say("Kitchen lights are on.")]);
  const brain = new Brain({ client });
  const r = await brain.handle("s1", "turn on the kitchen lights");
  assert.equal(r.reply, "Kitchen lights are on.");
  assert.equal(r.awaitingConfirmation, false);
  const toolResult = client.calls[1].messages.at(-1).content[0];
  assert.equal(toolResult.type, "tool_result");
  assert.match(toolResult.content, /"on":true/);
  assert.equal(client.calls[0].model, "claude-opus-5-5");
  assert.equal(client.calls[0].fallbacks, "default");
});

test("risky tool waits for a spoken yes, then runs", async () => {
  const client = fakeClient([use("t1", "claude_code", { folder: "hello", task: "make a hello world app" }), say("Started Claude Code.")]);
  const brain = new Brain({ client });
  const r = await brain.handle("s2", "build me a hello world app");
  assert.equal(r.awaitingConfirmation, true);
  assert.match(r.reply, /Should I run Claude Code in the "hello" folder/);
  assert.equal(client.calls.length, 1, "nothing ran yet");
  assert.equal(fs.existsSync(path.join(tmp, "projects/hello")), false);

  const announced = new Promise((resolve) => jobEvents.once("announce", resolve));
  const r2 = await brain.confirm("s2", "yes");
  assert.equal(r2.reply, "Started Claude Code.");
  assert.match(await announced, /Claude Code finished in hello\. Created a hello world app\./);
  assert.ok(fs.existsSync(path.join(tmp, "projects/hello/made-by-fake-claude.txt")));
});

test("saying no cancels the risky action", async () => {
  const client = fakeClient([use("t1", "claude_code", { folder: "nope", task: "delete everything" })]);
  const brain = new Brain({ client });
  await brain.handle("s3", "wipe the project");
  const r = await brain.confirm("s3", "no don't");
  assert.match(r.reply, /^(Okay, I won.t\.|Got it, I.ll leave it\.|No problem, cancelled\.|Okay, not doing that\.)$/);
  assert.equal(fs.existsSync(path.join(tmp, "projects/nope")), false);
  const log = fs.readFileSync(path.join(tmp, "actions.log"), "utf8");
  assert.match(log, /"type":"declined"/);
});

test("moving on without answering counts as no, and history stays valid", async () => {
  const client = fakeClient([use("t1", "claude_code", { folder: "x", task: "y" }), say("Sure.")]);
  const brain = new Brain({ client });
  await brain.handle("s4", "build x");
  await brain.handle("s4", "actually never mind, what time is it");
  const msgs = client.calls[1].messages;
  const last = msgs.at(-1).content;
  assert.equal(last[0].type, "tool_result");
  assert.equal(last[0].is_error, true);
  assert.equal(last[1].type, "text");
});

test("yes detection is strict", () => {
  for (const y of ["yes", "Yes please", "confirm", "yeah do it", "go ahead"]) assert.equal(isYes(y), true, y);
  for (const n of ["no", "yes no wait", "don't", "maybe", "cancel that", "yesterday"]) assert.equal(isYes(n), false, n);
});

test("Claude Code folders can't escape the projects directory", () => {
  assert.throws(() => resolveProjectFolder("../../etc"));
  assert.throws(() => resolveProjectFolder("/etc"));
  assert.ok(resolveProjectFolder("todo-app").endsWith(path.join("projects", "todo-app")));
});
