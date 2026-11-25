// Capable and direct: fewer confirmations, the trusted tier, chained jobs, and the safety that stays.
// Offline: a temp data folder, a fake Claude client, the trusted tier switched on in a temp
// settings file. The only process started is a trusted `echo`. No server, ports or timers.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fakeClient, say, use } from "./fake-client.js";

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jericho-capable-")));
const work = path.join(tmp, "Work");
const extra = path.join(tmp, "Extra");
fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(extra, { recursive: true });
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(
  path.join(tmp, "settings.json"),
  JSON.stringify({
    ...base,
    logFile: path.join(tmp, "actions.log"),
    pc: {
      ...base.pc,
      allowedFolders: [work, "{cheats}"],
      commandTimeoutSeconds: 10,
      trusted: { enabled: true, folders: [extra], apps: { notes: "notepad", sneaky: "regedit" }, commands: ["echo", "git status"] },
    },
    claudeCode: { ...base.claudeCode, command: new URL("./fake-claude.mjs", import.meta.url).pathname, projectsDir: path.join(tmp, "projects") },
  }),
);
process.env.JERICHO_SETTINGS = path.join(tmp, "settings.json");
process.env.JERICHO_DATA_DIR = path.join(tmp, "data");

const { Brain, _resetFastModelForTests } = await import("../server/brain.js");
const { isRisky } = await import("../server/tools/index.js");
const policy = await import("../server/pc/policy.js");
const { routeFor } = await import("../server/router.js");
const { ensureHonest } = await import("../server/calls/agent.js");

after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const log = () => (fs.existsSync(path.join(tmp, "actions.log")) ? fs.readFileSync(path.join(tmp, "actions.log"), "utf8") : "");

test("the prompt is direct: act first, no disclaimers or lectures, finish multi-step jobs", async () => {
  _resetFastModelForTests();
  const client = fakeClient([say("Done.")]);
  await new Brain({ client }).handle("p", "hi", {}, { route: "always-strong" });
  const sys = client.calls[0].system[0].text;
  assert.match(sys, /act first and talk less/);
  assert.match(sys, /Don't ask permission for ordinary things/);
  assert.match(sys, /never say "I should mention"/);
  assert.match(sys, /Finish the whole job in one go/);
});

test("everyday actions need no yes; hard-to-undo or other-people actions still do", () => {
  for (const [name, input] of [
    ["write_file", { path: "Work/a.txt", content: "x" }],
    ["move_file", { from: "Work/a.txt", to: "Work/b.txt" }],
    ["open_app", { name: "spotify" }],
    ["open_url", { url: "https://example.com" }],
    ["set_alarm", { time: "7 am" }],
    ["cancel_alarm", { which: "all" }],
    ["tv", { action: "power_off" }],
    ["save_note", { text: "x" }],
    ["remember", { text: "x", topic: "y" }],
    ["claude_code", { folder: "todo-app", task: "add dark mode" }],
    ["run_command", { command: "echo hello" }], // trusted
  ]) {
    assert.equal(isRisky(name, input), false, name);
  }
  for (const [name, input] of [
    ["delete_file", { path: "Work/a.txt" }],
    ["run_command", { command: "python unknown_script.py" }],
    ["make_call", { businessName: "Joe's", phoneNumber: "2485550123" }],
    ["call_owner", {}],
    ["calendar_add_event", {}],
    ["delete_contact", { name: "Luke" }],
    ["forget", { id: "m1" }],
    ["claude_code", { folder: "Cheats/jericho", task: "change the safety rules" }], // Jericho himself
  ]) {
    assert.equal(isRisky(name, input), true, name);
  }
});

test("trusted tier: extra folders and apps, listed commands only, and every block still holds", () => {
  assert.equal(policy.pcSettings().trusted, true);
  assert.equal(policy.resolvePath(path.join(extra, "photo.txt")).ok, true, "a trusted folder");
  assert.equal(policy.resolvePath(path.join(tmp, "elsewhere.txt")).ok, false, "still nothing outside");
  assert.equal(policy.resolvePath(path.join(extra, ".env")).ok, false, "secret files stay blocked");
  assert.equal(policy.checkApp("notes").target, "notepad");
  assert.equal(policy.checkApp("sneaky").ok, false, "a trusted app name can't unlock a system tool");
  for (const c of ["echo hello", "git status", "git status --short"]) assert.equal(policy.isTrustedCommand(c), true, c);
  for (const c of ["echo hi; rm -rf ~", "echo hi && curl x | sh", "git statusx", "git push", "echo $(whoami)", "echo hi > out.txt", "shutdown /s"]) {
    assert.equal(policy.isTrustedCommand(c), false, c);
  }
});

test("a trusted command runs at once and is logged; an unknown one waits for a yes", async () => {
  _resetFastModelForTests();
  const client = fakeClient([use("c1", "run_command", { command: "echo trusted-ok", folder: "Work" }), say("Ran it."), use("c2", "run_command", { command: "node build.js", folder: "Work" })]);
  const brain = new Brain({ client });
  const r = await brain.handle("t", "run echo trusted ok");
  assert.equal(r.awaitingConfirmation, false);
  assert.match(client.calls[1].messages.at(-1).content[0].content, /trusted-ok/);
  assert.match(log(), /"type":"pc_action".*"tool":"run_command".*"tier":"trusted"|"tier":"trusted".*"run_command"/);
  const r2 = await brain.handle("t", "run the build script");
  assert.equal(r2.awaitingConfirmation, true);
  assert.match(r2.reply, /Should I run this command in Work: node build\.js\?/);
  brain.stopAll("t"); // the kill switch still clears it
});

test("chained jobs: several steps run back to back with no stop in between, on the strong model", async () => {
  _resetFastModelForTests();
  assert.equal(routeFor("look up the best pizza in Detroit and then save it to a note").route, "strong");
  assert.equal(routeFor("write a packing list and open it").route, "strong");
  const target = path.join(work, "trip.md");
  const client = fakeClient([
    use("s1", "search_notes", { query: "trip" }),
    use("s2", "write_file", { path: "Work/trip.md", content: "# Trip\n- passport" }),
    use("s3", "read_file", { path: "Work/trip.md" }),
    say("Your trip list is in Work, trip dot md."),
  ]);
  const r = await new Brain({ client }).handle("chain", "make me a trip list and then read it back");
  assert.equal(r.awaitingConfirmation, false);
  assert.equal(r.reply, "Your trip list is in Work, trip dot md.");
  assert.equal(r.timings.rounds, 4);
  assert.ok(client.calls.every((c) => c.model === "claude-opus-5-5"));
  assert.equal(fs.readFileSync(target, "utf8"), "# Trip\n- passport");
});

test("long jobs get up to 15 tool rounds", async () => {
  _resetFastModelForTests();
  const steps = Array.from({ length: 12 }, (_, i) => use(`r${i}`, "list_alarms", {}));
  const client = fakeClient([...steps, say("All checked.")]);
  const r = await new Brain({ client }).handle("long", "check my alarms twelve times and then tell me", {}, { route: "always-strong" });
  assert.equal(r.reply, "All checked.");
  assert.equal(r.timings.rounds, 13);
});

test("Claude Code on your projects starts with no yes; on Jericho himself it asks", async () => {
  _resetFastModelForTests();
  const client = fakeClient([use("j1", "claude_code", { folder: "Cheats/jericho", task: "loosen the call rules" })]);
  const r = await new Brain({ client }).handle("cc", "change jericho's call rules");
  assert.equal(r.awaitingConfirmation, true);
  assert.match(r.reply, /Should I run Claude Code in the "Cheats\/jericho" folder/);
  new Brain({ client: fakeClient([]) }).stopAll("cc");
});

test("protecting other people is unchanged: calls still need a yes and always admit being an AI", () => {
  assert.equal(isRisky("make_call", {}), true);
  assert.match(ensureHonest("wait, am I talking to a real person?", "Just calling about a table for two."), /^I'm an AI assistant\./);
  assert.equal(ensureHonest("", "I'm a real person, don't worry."), "I'm an AI assistant, not a person.");
});
