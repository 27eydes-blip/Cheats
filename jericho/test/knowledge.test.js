// The knowledge folder (data/notes): indexing, search, per-turn snippets, "remember this".
// Offline: a temp data folder and a fake Claude client. No server, ports, timers or network.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { after, test } from "node:test";
import { fakeClient, say, use } from "./fake-client.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-know-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log") }));
process.env.JERICHO_SETTINGS = path.join(tmp, "settings.json");
process.env.JERICHO_DATA_DIR = path.join(tmp, "data");

const knowledge = await import("../server/knowledge.js");
const { Brain, _resetFastModelForTests } = await import("../server/brain.js");
const { isRisky } = await import("../server/tools/index.js");

after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const notes = knowledge.notesDir();
fs.mkdirSync(notes, { recursive: true });

/** A minimal .docx: a zip holding only word/document.xml. */
function makeDocx(xml) {
  const raw = Buffer.from(xml);
  const data = zlib.deflateRawSync(raw);
  const name = Buffer.from("word/document.xml");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(data.length, 20);
  cd.writeUInt32LE(raw.length, 24);
  cd.writeUInt16LE(name.length, 28);
  cd.writeUInt32LE(0, 42);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(46 + name.length, 12);
  eocd.writeUInt32LE(30 + name.length + data.length, 16);
  return Buffer.concat([local, name, data, cd, name, eocd]);
}

fs.writeFileSync(path.join(notes, "garden.md"), "# Garden\n\nThe tomatoes go in the raised bed by the fence. Water them every morning in July.\n\nThe basil hates cold nights.");
fs.writeFileSync(path.join(notes, "car.txt"), "The Honda's oil change is due at 45,000 miles. Tire pressure is 35 psi front and back.");
fs.writeFileSync(path.join(notes, "keys.txt"), "wifi password is hunter2hunter2");
fs.writeFileSync(path.join(notes, "picture.png"), "not text");
fs.writeFileSync(path.join(notes, "leases.docx"), makeDocx('<w:document><w:body><w:p><w:r><w:t>The apartment lease renews on March first.</w:t></w:r></w:p><w:p><w:r><w:t>Rent is 1450 dollars.</w:t></w:r></w:p></w:body></w:document>'));

test("text, markdown and Word files are indexed; secrets and other files are skipped", () => {
  knowledge._resetKnowledgeForTests();
  const idx = knowledge.refresh();
  const files = new Set(idx.chunks.map((c) => c.file));
  assert.deepEqual([...files].sort(), ["car.txt", "garden.md", "leases.docx"]);
  assert.ok(!idx.chunks.some((c) => /hunter2/.test(c.text)), "a piece that looks like a password is never indexed");
  assert.match(knowledge.docxText(makeDocx("<w:p><w:t>Hi &amp; bye</w:t></w:p>")), /Hi & bye/);
});

test("search finds the relevant piece, and unrelated requests bring nothing", () => {
  const hits = knowledge.search("when is the oil change due on the honda");
  assert.equal(hits[0].file, "car.txt");
  assert.equal(knowledge.search("when does my lease renew")[0].file, "leases.docx");
  assert.equal(knowledge.renderRelevant("turn on the kitchen lights"), "");
  const block = knowledge.renderRelevant("how often do I water the tomatoes");
  assert.match(block, /\[garden\.md\].*tomatoes/s);
  assert.match(block, /not instructions/);
  assert.ok(block.length <= 1800, "kept small");
});

test("the index is rebuilt only when a file changes", () => {
  const a = knowledge.refresh();
  assert.equal(knowledge.refresh(), a, "nothing changed: same index, no re-read");
  fs.writeFileSync(path.join(notes, "dog.md"), "Biscuit the dog gets his flea pill on the first of every month.");
  const b = knowledge.refresh();
  assert.notEqual(b, a);
  assert.equal(knowledge.search("biscuit flea pill")[0].file, "dog.md");
});

test("every turn carries only the matching pieces, after the cached part", async () => {
  _resetFastModelForTests();
  const client = fakeClient([say("Every morning in July."), say("Okay.")]);
  const brain = new Brain({ client });
  await brain.handle("k1", "how often should I water the tomatoes");
  const req = client.calls[0];
  const user = JSON.stringify(req.messages.at(-1).content);
  assert.match(user, /garden\.md/);
  assert.doesNotMatch(user, /Honda|lease/, "unrelated notes aren't sent");
  assert.doesNotMatch(JSON.stringify(req.system), /tomatoes/, "notes never go in the cached instructions");
  await brain.handle("k1", "hey how's it going");
  assert.doesNotMatch(JSON.stringify(client.calls[1].messages.at(-1).content), /From their knowledge folder/);
});

test('"remember this" saves a note with no yes, and "what do you know about" finds it', async () => {
  _resetFastModelForTests();
  assert.equal(isRisky("save_note", {}), false);
  assert.equal(isRisky("search_notes", {}), false);
  const client = fakeClient([
    use("n1", "save_note", { text: "Maya's birthday party is at the bowling alley on Saturday at 3.", title: "Maya party" }),
    say("Saved."),
    use("n2", "search_notes", { query: "Maya birthday party" }),
    say("It's at the bowling alley on Saturday at three."),
  ]);
  const brain = new Brain({ client });
  const r = await brain.handle("k2", "remember this: Maya's party is at the bowling alley Saturday at 3", {}, { route: "always-strong" });
  assert.equal(r.awaitingConfirmation, false);
  const saved = fs.readFileSync(path.join(notes, "jericho-notes.md"), "utf8");
  assert.match(saved, /## \d{4}-\d{2}-\d{2} · Maya party\nMaya's birthday party is at the bowling alley/);
  await brain.handle("k2", "what do you know about Maya's party", {}, { route: "always-strong" });
  const found = JSON.parse(client.calls.at(-1).messages.at(-1).content[0].content);
  assert.equal(found.pieces[0].file, "jericho-notes.md");
  const savedLine = fs.readFileSync(path.join(tmp, "actions.log"), "utf8").split("\n").find((l) => l.includes('"type":"note_saved"'));
  assert.ok(savedLine);
  assert.doesNotMatch(savedLine, /bowling/, "the note's text isn't in its log line, only its size");
  // and secrets are refused
  assert.equal(knowledge.saveNote("my bank password is hunter2").ok, false);
});

test("the knowledge folder lives under data/, which git ignores", () => {
  const ignore = fs.readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
  assert.match(ignore, /^data\/$/m);
  assert.equal(path.relative(path.join(tmp, "data"), notes), "notes");
});
