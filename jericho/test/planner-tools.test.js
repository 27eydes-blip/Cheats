// Planner tools by voice, the quick local answers, the briefing part, live updates, and the
// /api/planner routes behind the access token. Offline: a temp data folder and a fake Claude.
// The one real server runs on a free port and is stopped with an AbortSignal (no kill calls).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fakeClient, say, use } from "./fake-client.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-planner-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
const settingsFile = path.join(tmp, "settings.json");
fs.writeFileSync(settingsFile, JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log"), briefing: { ...base.briefing, calendarIcsUrl: "" } }));
Object.assign(process.env, { JERICHO_SETTINGS: settingsFile, JERICHO_DATA_DIR: path.join(tmp, "data"), CALENDAR_ICS_URL: "" });

const planner = await import("../server/planner/index.js");
const store = await import("../server/planner/store.js");
const { today, addDays, localOf } = await import("../server/planner/dates.js");
const { Brain, _resetFastModelForTests } = await import("../server/brain.js");
const { isRisky, tools } = await import("../server/tools/index.js");
const { matchQuick } = await import("../server/quick.js");

after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const log = () => (fs.existsSync(path.join(tmp, "actions.log")) ? fs.readFileSync(path.join(tmp, "actions.log"), "utf8") : "");
const WED = new Date("2026-11-25T15:00:00Z"); // Wednesday 10 AM in Detroit
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

test("natural speech: homework, tests and classes are added in Detroit time", () => {
  const hw = planner.addHomework({ title: "Accounting homework", subject: "accounting", due: "tomorrow", minutes: "40 minutes" }, WED);
  assert.equal(hw.ok, true);
  assert.match(hw.say, /^Added Accounting homework, due tomorrow, Thursday, November 26, about 40 minutes\.$/);
  assert.equal(hw.item.due, "2026-11-27T04:59:00.000Z", "11:59 PM Thursday in Detroit");
  const test1 = planner.addEvent({ title: "Physics test", when: "Friday", kind: "test" }, WED);
  assert.equal(test1.item.allDay, true);
  assert.match(test1.say, /Physics test on Friday, November 27\./);
  const dentist = planner.addEvent({ title: "Dentist", when: "Monday at 4", minutes: "45 minutes" }, WED);
  assert.equal(dentist.item.start, "2026-11-30T21:00:00.000Z");
  assert.equal(new Date(dentist.item.end) - new Date(dentist.item.start), 45 * 60000);
  const guess = planner.addHomework({ title: "Reading", due: "Dec 1" }, WED);
  assert.match(guess.say, /about 30 minutes \(my guess/);
  const cls = planner.setClasses({ classes: [{ title: "Calculus", days: "MWF", start: "9", end: "9:50" }, { title: "History", days: "tues and thurs", start: "1:00", end: "2:15" }] });
  assert.equal(cls.ok, true);
  assert.deepEqual(store.list().filter((i) => i.type === "class").map((c) => [c.title, c.days, c.start, c.end]), [["Calculus", [1, 3, 5], "09:00", "09:50"], ["History", [2, 4], "13:00", "14:15"]]);
  assert.equal(planner.setClasses({ classes: [{ title: "Bio", days: "", start: "9", end: "10" }] }).ok, false);
});

test("an ambiguous date or item gets one short question, and nothing is saved", () => {
  const n = store.list().length;
  const r = planner.addHomework({ title: "Lab", due: "next Friday", minutes: "90" }, WED);
  assert.equal(r.ok, false);
  assert.equal(r.ask, "Do you mean Friday, November 27, or Friday, December 4?");
  assert.equal(store.list().length, n);
  planner.addHomework({ title: "Physics lab", due: "2026-12-04 9am", minutes: "90" }, WED);
  planner.addHomework({ title: "Physics problems", due: "Monday", minutes: "30" }, WED);
  const which = planner.resolveItem("physics", { types: ["homework"], now: WED });
  assert.match(which.ask, /^Which one: Physics lab, due Friday, December 4 at 9 AM, or Physics problems, due Monday, November 30\?$/);
});

test("check off, move, list due, this week, free time and the study plan", async () => {
  assert.match(planner.completeHomework({ which: "accounting" }, WED).say, /Checked off Accounting homework\./);
  assert.equal(store.list().find((i) => i.title === "Accounting homework").done, true);
  assert.match(planner.moveItem({ which: "physics test", to: "Saturday" }, WED).say, /Moved Physics test to Saturday, November 28\./);
  assert.match(planner.moveItem({ which: "physics problems", to: "Tuesday at 8am" }, WED).say, /Physics problems is now due Tuesday, December 1 at 8 AM\./);
  const due = await planner.listDue({ range: "week" }, WED);
  assert.ok(!due.homework.some((h) => h.title === "Accounting homework"), "finished homework isn't listed");
  const week = await planner.listWeek({}, WED);
  assert.match(week.say, /Saturday: Physics test/);
  const free = await planner.findFreeTime({ day: "Thursday", minutes: "90 minutes" }, WED);
  assert.match(free.say, /^You're free 7 AM to 1 PM, 2:15 PM to 10 PM\.$/);
  const plan = await planner.planMyWeek(WED);
  assert.ok(plan.drafts.length > 0);
  assert.match(plan.say, /They're drafts/);
  assert.ok(store.list().filter((i) => i.type === "study_block").every((b) => b.status === "draft"), "never auto-committed");
  const again = await planner.planMyWeek(WED);
  assert.equal(store.list().filter((i) => i.type === "study_block").length, again.drafts.length, "a new plan replaces the old drafts");
  const kept = planner.reviewPlan({ action: "accept" });
  assert.equal(kept.ok, true);
  assert.ok(store.list().filter((i) => i.type === "study_block").every((b) => b.status === "accepted"));
  assert.equal(planner.reviewPlan({ action: "reject" }).ok, false, "nothing left to review");
});

test("delete asks for a spoken yes; everything else runs at once", async () => {
  _resetFastModelForTests();
  for (const name of ["add_homework", "add_event", "set_classes", "list_week", "list_due", "complete_homework", "move_item", "find_free_time", "plan_week", "review_plan", "open_planner"]) {
    assert.ok(tools.has(name), name);
    assert.equal(isRisky(name, {}), false, name);
  }
  assert.equal(isRisky("delete_item", { which: "dentist" }), true);
  const client = fakeClient([use("d1", "delete_item", { which: "dentist" }), say("Deleted.")]);
  const brain = new Brain({ client });
  const r = await brain.handle("pd", "delete the dentist from my planner");
  assert.equal(r.awaitingConfirmation, true);
  assert.equal(r.reply, "Should I delete Dentist from your planner? Say yes to confirm.");
  assert.ok(store.list().some((i) => i.title === "Dentist"), "not before the yes");
  await brain.confirm("pd", "yes");
  assert.ok(!store.list().some((i) => i.title === "Dentist"));
});

test("by voice through Jericho: the small model adds a test, and an ambiguous day comes back as a question", async () => {
  _resetFastModelForTests();
  const now = new Date();
  const dow = DAYS[new Date(`${today(now)}T12:00:00Z`).getUTCDay()];
  const client = fakeClient([
    (req) => (assert.equal(req.model, "claude-haiku-5-5"), use("a1", "add_event", { title: "Physics test", when: "tomorrow", kind: "test" })),
    say("Got it."),
    use("a2", "add_homework", { title: "Essay", due: `next ${dow}`, minutes: "60" }),
    say("Do you mean today or next week?"),
  ]);
  const brain = new Brain({ client });
  await brain.handle("v1", "I have a physics test tomorrow");
  const added = store.list().find((i) => i.title === "Physics test" && localOf(i.start).date === addDays(today(now), 1));
  assert.ok(added, "saved for tomorrow");
  assert.equal(added.allDay, true);
  await brain.handle("v1", `add an hour of essay homework due next ${dow}`);
  const result = JSON.parse(client.calls.at(-1).messages.at(-1).content[0].content);
  assert.equal(result.ok, false);
  assert.match(result.ask, /^Do you mean today, /);
  assert.ok(!store.list().some((i) => i.title === "Essay"));
});

test("quick local answers: open my planner, what's due, this week (no Claude call)", async () => {
  const client = fakeClient([]); // anything sent to Claude would throw
  const brain = new Brain({ client });
  planner.addHomework({ title: "Spanish vocab", due: "tomorrow", minutes: "20" });
  const cards = [];
  const open = await brain.handle("q1", "open my planner", { onCard: (c) => cards.push(c) });
  assert.equal(open.reply, "Here's your planner.");
  assert.deepEqual(cards, [{ kind: "open-planner" }]);
  const due = await brain.handle("q1", "what's due tomorrow");
  assert.match(due.reply, /Spanish vocab, due tomorrow/);
  const week = await brain.handle("q1", "what do I have this week");
  assert.ok(week.reply.length > 0);
  assert.equal(client.calls.length, 0);
  assert.deepEqual(matchQuick("whats due today"), { kind: "planner", tool: "list_due", input: { range: "today" } });
});

test("the morning briefing gets homework due today and tomorrow, and today's free time", async () => {
  const part = await planner.briefingPart();
  assert.equal(part.ok, true);
  assert.ok(part.dueTomorrow.some((h) => h.title === "Spanish vocab"));
  assert.match(part.freeToday, /hour|minute/);
  const { morningBriefingTool } = await import("../server/tools/briefing.js");
  assert.match(morningBriefingTool.definition.description, /homework due today and tomorrow/);
});

test("data lives in data/planner.json (git-ignored), changes push a live update, and titles stay out of the log", () => {
  const seen = [];
  const on = (e) => seen.push(e);
  store.plannerEvents.on("changed", on);
  planner.addHomework({ title: "Secret diary entry", due: "tomorrow" });
  store.plannerEvents.off("changed", on);
  assert.equal(seen.length, 1);
  assert.ok(seen[0].version > 0);
  const file = path.join(tmp, "data", "planner.json");
  assert.ok(JSON.parse(fs.readFileSync(file, "utf8")).items.some((i) => i.title === "Secret diary entry"));
  assert.match(fs.readFileSync(new URL("../.gitignore", import.meta.url), "utf8"), /^data\/$/m);
  assert.doesNotMatch(log().split("\n").filter((l) => l.includes("planner_changed")).join("\n"), /Secret diary/);
});

// ---- the real server: the planner API needs the access token ----------------------------------------

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

test("the Planner page and its data routes sit behind the access token", async () => {
  const port = await freePort();
  const stop = new AbortController();
  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, PORT: String(port), JERICHO_SKIP_SELFTEST: "1", JERICHO_NO_ENV_FILE: "1", JERICHO_ACCESS_TOKEN: "planner-test-token", ANTHROPIC_API_KEY: "", ELEVENLABS_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
    signal: stop.signal,
  });
  server.on("error", () => {}); // the abort at the end reports as an error event
  const exited = new Promise((r) => server.once("exit", r));
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("server didn't start")), 15_000);
      server.stdout.on("data", (d) => /is running/.test(d) && (clearTimeout(timer), resolve()));
      server.once("exit", (c) => (clearTimeout(timer), reject(new Error(`server exited ${c}`))));
    });
    const url = (p) => `http://127.0.0.1:${port}${p}`;
    assert.equal((await fetch(url("/api/planner"))).status, 401);
    assert.equal((await fetch(url("/api/planner"), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 401);
    const headers = { "x-jericho-token": "planner-test-token", "content-type": "application/json" };
    const view = await (await fetch(url("/api/planner?view=week"), { headers })).json();
    assert.equal(view.ok, true);
    assert.equal(view.days.length, 7);
    assert.ok(view.summary && Array.isArray(view.summary.homework));
    const hw = view.summary.homework.find((h) => !h.done);
    const toggled = await (await fetch(url("/api/planner"), { method: "POST", headers, body: JSON.stringify({ op: "toggle", id: hw.id }) })).json();
    assert.equal(toggled.item.done, true);
    const bad = await fetch(url("/api/planner"), { method: "POST", headers, body: JSON.stringify({ op: "add", type: "event", title: "x", start: "soon" }) });
    assert.equal(bad.status, 400);
    const month = await (await fetch(url("/api/planner?view=month"), { headers })).json();
    assert.ok(month.days.length >= 28 && month.days.length <= 42);
    assert.equal((await fetch(url("/planner"))).status, 200, "the page itself loads; its data needs the token");
  } finally {
    stop.abort();
    await exited;
  }
});
