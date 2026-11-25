// Learning about the user: profile (only from things they said), lessons from corrections,
// mood/pace notes, varied wording, the stronger model for hard questions, and the summary tool.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fakeClient, json, say, use } from "./fake-client.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-learn-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log") }));
process.env.JERICHO_SETTINGS = path.join(tmp, "settings.json");
process.env.JERICHO_DATA_DIR = path.join(tmp, "data");

const memory = await import("../server/memory.js");
const { Brain, deliveryNote } = await import("../server/brain.js");
const { whatIveLearnedTool } = await import("../server/tools/learning.js");
const log = () => fs.readFileSync(path.join(tmp, "actions.log"), "utf8");
const learnReply = (out) => (req) => (JSON.stringify(req.system || "").includes("You keep the notes") ? json(out) : null);
const emptyStyle = { phrases: [], requestLength: "", replyPreferences: [], mishearings: [] };

test("after a conversation, the profile learns only what the user actually said", async () => {
  const out = {
    style: { ...emptyStyle, replyPreferences: ["Short answers"] },
    profile: {
      keep: [],
      edit: [],
      mentioned: [],
      add: [
        { category: "projects", text: "Building a tic tac toe game for his nephew Leo", quote: "building a tic tac toe game for my nephew Leo" },
        { category: "routines", text: "Goes to the gym on Mondays", quote: "I go to the gym on mondays" },
        { category: "preferences", text: "Seems to be an introvert", quote: "I stayed in all weekend" }, // a guess: rejected
        { category: "goals", text: "Wants to run a marathon", quote: "I want to run a marathon" }, // never said: rejected
        { category: "people", text: "His therapist is Dr Lee", quote: "my therapist Dr Lee" }, // private: rejected
      ],
    },
    lessons: [],
    summary: "Talked about the tic tac toe build and gym days.",
  };
  const client = fakeClient([say("Nice.")], learnReply(out));
  const brain = new Brain({ client });
  await brain.handle("a", "I'm building a tic tac toe game for my nephew Leo, and I go to the gym on Mondays. I stayed in all weekend. My therapist Dr Lee says hi.");
  assert.equal(brain.conversationEnded("a"), true);
  await new Promise((r) => setTimeout(r, 50));
  const p = memory.getProfile();
  assert.deepEqual(p.items.map((i) => i.text).sort(), ["Building a tic tac toe game for his nephew Leo", "Goes to the gym on Mondays"]);
  assert.equal(p.recent.at(-1).text, "Talked about the tic tac toe build and gym days.");
  assert.deepEqual(memory.getStyle().replyPreferences, ["Short answers"]);
  // logged, but without the personal text
  const line = log().split("\n").find((l) => l.includes('"type":"profile_updated"'));
  assert.match(line, /"added":2,.*"rejected":3/);
  assert.doesNotMatch(log().split("\n").filter((l) => /profile_|lesson_/.test(l)).join("\n"), /tic tac toe|nephew|gym/);
});

test("duplicates merge, repeat mentions count up, stale items drop, and it stays under 500 words", async () => {
  const before = memory.getProfile().items;
  const gym = before.find((i) => i.text.includes("gym"));
  const build = before.find((i) => i.text.includes("tic tac toe"));
  memory.applyProfileUpdate(
    { keep: [build.id], edit: [], mentioned: [build.id], add: [{ category: "projects", text: "Building a tic tac toe game for his nephew Leo", quote: "the tic tac toe game" }] },
    "how's the tic tac toe game going",
  );
  const p = memory.getProfile();
  assert.equal(p.items.length, 1, "gym dropped (not kept), duplicate merged");
  assert.equal(p.items[0].mentions, 3);
  assert.ok(!p.items.some((i) => i.id === gym.id));

  const many = Array.from({ length: 80 }, (_, i) => ({ category: "topics", text: `Topic number ${i} with a few extra words here`, quote: `topic ${i}` }));
  memory.applyProfileUpdate({ keep: p.items.map((i) => i.id), edit: [], mentioned: [], add: many }, many.map((m) => m.quote).join(" "));
  assert.ok(memory.profileWordCount(memory.getProfile()) <= 500);
});

test("a correction becomes a lasting lesson, applied straight away and in later conversations", async () => {
  const client = fakeClient([
    use("t1", "save_lesson", { lesson: "When he says 'the lights' with no room, he means the office", quote: "no, I meant the office" }),
    say("Got it, office lights from now on."),
    say("Office lights on."),
    say("Hi."),
  ]);
  const brain = new Brain({ client });
  await brain.handle("c", "no, I meant the office");
  assert.equal(memory.listLessons().at(-1).text, "When he says 'the lights' with no room, he means the office");
  // the very next turn already has it
  await brain.handle("c", "turn on the lights");
  assert.match(JSON.stringify(client.calls[2].messages.at(-1)), /When he says 'the lights' with no room, he means the office/);
  // and a new conversation has it in the instructions
  await new Brain({ client }).handle("d", "hello");
  assert.match(client.calls[3].system[1].text, /Lessons from the user's corrections[\s\S]*the office/);
  assert.match(log(), /"type":"lesson_saved"/);
});

test("lessons must quote the user, and secrets are never saved", async () => {
  assert.equal(memory.addLesson("Always call him boss", "call me boss", "turn on the kitchen lights").ok, false);
  const r = memory.addLesson("His PIN is 4421", "my pin is 4421", "my pin is 4421");
  assert.equal(r.refused, true);
  assert.doesNotMatch(fs.readFileSync(path.join(tmp, "data/lessons.json"), "utf8"), /4421/);
  const again = memory.addLesson("When he says 'the lights' with no room, he means the office", "I said the office", "I said the office");
  assert.equal(again.reinforced, true);
});

test("each request says how it was delivered, so Claude can match mood and pace", async () => {
  assert.equal(deliveryNote("lights off now quick", { speechMs: 900 }), "4 words, spoken at about 267 words a minute (fast)");
  assert.equal(deliveryNote("so I was thinking maybe we could look at the garden plans later", { speechMs: 6000 }), "13 words, spoken at about 130 words a minute (normal pace)");
  assert.equal(deliveryNote("hi there", { typed: true }), "2 words, typed");
  const client = fakeClient([say("On.")]);
  await new Brain({ client }).handle("e", "lights on quick", {}, { speechMs: 700 });
  assert.match(client.calls[0].messages[0].content.at(-1).text, /\(delivery: 3 words, spoken at about 257 words a minute \(fast\)\)$/);
  // a quick request goes to the small model, whose short instructions still match the pace
  assert.match(client.calls[0].system[0].text, /rushed means a few words/);
  const strong = fakeClient([say("On.")]);
  await new Brain({ client: strong }).handle("e2", "lights on quick", {}, { speechMs: 700, route: "always-strong" });
  assert.match(strong.calls[0].system[0].text, /rushed or fast: the shortest useful answer/);
  assert.match(strong.calls[0].system[0].text, /At most one suggestion per reply/);
});

test("fixed replies never repeat the same wording twice in a row", async () => {
  const client = fakeClient(Array.from({ length: 6 }, (_, i) => use(`t${i}`, "run_command", { command: "echo hi" })));
  const brain = new Brain({ client });
  const replies = [];
  for (let i = 0; i < 6; i++) {
    await brain.handle("f", "build it");
    replies.push((await brain.confirm("f", "no")).reply);
  }
  for (let i = 1; i < replies.length; i++) assert.notEqual(replies[i], replies[i - 1]);
});

test("hard questions go to the stronger model, which knows the profile and lessons", async () => {
  const client = fakeClient(
    [use("t1", "deep_think", { question: "Should I build the game in Python or JavaScript?", detail: "normal" }), say("JavaScript, so Leo can play it in a browser.")],
    (req) => (req.model === "claude-fable-5-2" ? say("JavaScript: it runs in any browser.") : null),
  );
  await new Brain({ client }).handle("g", "python or javascript for the game?");
  const hard = client.calls.find((c) => c.model === "claude-fable-5-2");
  assert.match(hard.system, /step by step/);
  assert.match(hard.system, /tic tac toe/);
  assert.match(hard.system, /the office/);
});

test("'what have you learned about me' has everything to summarise", async () => {
  memory.addMemory("Takes coffee black", "food");
  const r = await whatIveLearnedTool.run({});
  assert.ok(r.profile.projects.some((p) => p.text.includes("tic tac toe")));
  assert.ok(r.lessons.some((l) => l.includes("office")));
  assert.equal(r.memories.count, 1);
  assert.match(r.note, /Memory page/);
});

test("wipe everything clears the profile and lessons too", () => {
  memory.wipeAll();
  assert.equal(memory.getProfile().items.length, 0);
  assert.equal(memory.listLessons().length, 0);
  assert.match(log(), /"type":"memory_wiped".*"lessonsDeleted":1/);
});

test("plans and decisions are steered to the stronger model; quick questions aren't", async () => {
  const { looksHard } = await import("../server/brain.js");
  assert.equal(looksHard("help me decide, should the game be in python or javascript given Leo only has an ipad"), true);
  assert.equal(looksHard("plan how I should split my evenings over the next six weeks"), true);
  assert.equal(looksHard("should I bring an umbrella"), false);
  assert.equal(looksHard("turn on the kitchen lights"), false);
  const client = fakeClient([say("Okay.")]);
  await new Brain({ client }).handle("h", "help me decide whether to take the train or drive to the coast this weekend");
  assert.match(JSON.stringify(client.calls[0].messages.at(-1)), /call deep_think/);
});
