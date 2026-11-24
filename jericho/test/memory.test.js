// Offline tests for memory, the secrets guard, forget confirmation and style notes.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fakeClient, say, use } from "./fake-client.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-mem-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log") }));
process.env.JERICHO_SETTINGS = path.join(tmp, "settings.json");
process.env.JERICHO_DATA_DIR = path.join(tmp, "data");

const memory = await import("../server/memory.js");
const { Brain } = await import("../server/brain.js");
const log = () => fs.readFileSync(path.join(tmp, "actions.log"), "utf8");


test("remember saves to data/memory.json and logs it; matching memories come with the request", async () => {
  const client = fakeClient([use("t1", "remember", { text: "Takes coffee black", topic: "food" }), say("Got it."), say("Black, no sugar.")]);
  const brain = new Brain({ client });
  assert.equal((await brain.handle("a", "remember that I take my coffee black")).reply, "Got it.");
  const saved = JSON.parse(fs.readFileSync(path.join(tmp, "data/memory.json"), "utf8")).memories;
  assert.equal(saved.at(-1).text, "Takes coffee black");
  assert.equal(saved.at(-1).topic, "food");
  assert.match(saved.at(-1).date, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(log(), /"type":"memory_saved"/);

  // Same conversation: the frozen instructions are untouched; the update arrives as an appended
  // system message, and the matching memory rides along with the request itself.
  await brain.handle("a", "how do I take my coffee?");
  const req = client.calls[2];
  assert.deepEqual(req.system, client.calls[0].system, "system prompt stays frozen within a conversation");
  assert.equal(req.messages.at(-1).role, "system");
  assert.match(req.messages.at(-1).content, /memory and notes were updated/);
  const asked = req.messages.at(-2).content.map((b) => b.text).join("\n");
  assert.match(asked, /Saved memories that may help[\s\S]*Takes coffee black/);

  // A new conversation: the instructions say how many memories there are, not all of them...
  const fresh = fakeClient([say("hi"), say("Black.")]);
  const b = new Brain({ client: fresh });
  await b.handle("b", "hello");
  assert.doesNotMatch(fresh.calls[0].system[1].text, /Takes coffee black/);
  assert.match(fresh.calls[0].system[1].text, /\d+ saved memor(y|ies)\. The ones that match a request are attached/);
  assert.doesNotMatch(JSON.stringify(fresh.calls[0].messages), /Takes coffee black/, "an unrelated request carries no memories");
  // ...and a request about coffee carries the coffee memory.
  await b.handle("b", "remind me how I like my coffee");
  assert.match(JSON.stringify(fresh.calls[1].messages.at(-1)), /Takes coffee black/);
});

test("secrets are never stored, even when Claude tries", async () => {
  for (const secret of ["My wifi password is hunter2", "Card 4111 1111 1111 1111", "SSN 123-45-6789", "API key sk-abcdefghijklmnop1234"]) {
    const r = memory.addMemory(secret, "misc");
    assert.equal(r.ok, false, secret);
    assert.equal(r.refused, true);
  }
  const client = fakeClient([use("t1", "remember", { text: "Bank PIN is 4421", topic: "money" }), say("I can't store that.")]);
  await new Brain({ client }).handle("c", "remember my bank pin is 4421");
  const result = client.calls[1].messages.at(-1).content[0];
  assert.match(result.content, /can't store passwords/);
  assert.doesNotMatch(fs.readFileSync(path.join(tmp, "data/memory.json"), "utf8"), /4421/);
  assert.doesNotMatch(log(), /4421/, "the refused secret isn't written to the log either");
});

test("forget reads the memory back and waits for a spoken yes", async () => {
  const { memory: m } = memory.addMemory("Sister Maya lives in Denver", "family");
  const client = fakeClient([use("t1", "forget", { id: m.id }), say("Forgotten.")]);
  const brain = new Brain({ client });
  const r = await brain.handle("d", "forget the thing about my sister");
  assert.equal(r.awaitingConfirmation, true);
  assert.match(r.reply, /Should I forget the memory "Sister Maya lives in Denver"\? Say yes to confirm\./);
  assert.ok(memory.findMemory(m.id), "not deleted before yes");
  await brain.confirm("d", "yes");
  assert.equal(memory.findMemory(m.id), null);
  assert.match(log(), /"type":"memory_deleted"/);
});

test("recall finds memories by keyword", async () => {
  memory.addMemory("Allergic to peanuts", "health");
  const { recallTool } = await import("../server/tools/memory.js");
  const r = await recallTool.run({ query: "what about peanuts" });
  assert.ok(r.memories.some((m) => m.text === "Allergic to peanuts"));
});

test("style notes: updated after a conversation, capped, secrets dropped, items deletable", async () => {
  const notes = {
    phrases: ["yo", "hit the lights", "my password is hunter2"],
    requestLength: "Short, three to six words",
    replyPreferences: ["One sentence", "No small talk"],
    mishearings: [{ heard: "jerry", meant: "Jericho" }],
  };
  const client = fakeClient([say("Lights on."), { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(notes) }] }]);
  const brain = new Brain({ client });
  await brain.handle("e", "yo hit the lights");
  assert.equal(brain.conversationEnded("e"), true);
  await new Promise((r) => setTimeout(r, 50));
  const req = client.calls[1];
  assert.equal(req.output_config.format.type, "json_schema");
  assert.ok(req.output_config.format.schema.properties.profile, "one call learns style and profile together");
  assert.match(req.messages[0].content, /User: yo hit the lights/);
  const style = memory.getStyle();
  assert.deepEqual(style.phrases, ["yo", "hit the lights"], "sensitive phrase dropped");
  assert.match(log(), /"type":"style_saved"/);
  assert.equal(brain.conversationEnded("e"), false, "nothing new to learn from");

  memory.saveStyle({ ...notes, phrases: Array.from({ length: 200 }, (_, i) => `phrase number ${i}`) });
  assert.ok(memory.styleWordCount(memory.getStyle()) <= 300);

  memory.deleteStyleItem("replyPreferences", 0);
  assert.deepEqual(memory.getStyle().replyPreferences, ["No small talk"]);
  memory.wipeAll();
  assert.equal(memory.listMemories().length, 0);
  assert.match(log(), /"type":"memory_wiped"/);
});
