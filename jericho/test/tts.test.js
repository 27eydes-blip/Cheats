// The audio cache: short phrases said more than once are saved and then served from disk.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { test } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-tts-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ ...base, voice: { ...base.voice, provider: "elevenlabs" }, logFile: path.join(tmp, "actions.log") }));
Object.assign(process.env, { JERICHO_SETTINGS: path.join(tmp, "settings.json"), JERICHO_DATA_DIR: path.join(tmp, "data"), ELEVENLABS_API_KEY: "test" });

const sent = [];
globalThis.fetch = async (url, init) => {
  sent.push(JSON.parse(init.body));
  return new Response(Buffer.from("MP3DATA"), { status: 200 });
};
const { streamSpeech } = await import("../server/tts.js");

function fakeRes() {
  const chunks = [];
  const res = new Writable({ write(c, _e, cb) { chunks.push(c); cb(); } });
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers; return res; };
  res.done = new Promise((r) => res.on("finish", r));
  res.body = () => Buffer.concat(chunks).toString();
  return res;
}

test("short repeated phrases are cached; voice settings come from settings.json", async () => {
  for (let i = 1; i <= 3; i++) {
    const res = fakeRes();
    await streamSpeech("Okay, I won't.", res);
    await res.done;
    assert.equal(res.body(), "MP3DATA");
    assert.equal(res.headers["x-tts-source"], i < 3 ? "elevenlabs" : "cache", `request ${i}`);
  }
  assert.equal(sent.length, 2, "third time came from data/audio-cache");
  assert.equal(fs.readdirSync(path.join(tmp, "data/audio-cache")).length, 1);
  assert.equal(sent[0].model_id, "eleven_flash_v2_5");
  assert.deepEqual(Object.keys(sent[0].voice_settings).sort(), ["similarity_boost", "speed", "stability", "style", "use_speaker_boost"]);

  const long = fakeRes();
  await streamSpeech("This sentence is much too long to be worth keeping in the cache at all.", long);
  await long.done;
  assert.equal(fs.readdirSync(path.join(tmp, "data/audio-cache")).length, 1, "long sentences aren't cached");
});
