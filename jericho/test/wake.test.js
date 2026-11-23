// The wake word: "Jericho", "Jer", the misheard variants, with or without "hey" / "okay".
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { DEFAULT_WAKE_WORDS, findWake, stripLeadingWake } from "../public/wake.js";

const settingsWords = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8")).wakeWords;

test("settings.json and the built-in list agree", () => {
  assert.deepEqual([...settingsWords].sort(), [...DEFAULT_WAKE_WORDS].sort());
});

test("wakes on Jericho, Jer and misheard variants, with or without hey/okay, and strips them", () => {
  for (const [said, rest] of [
    ["Jericho turn on the lights", "turn on the lights"],
    ["hey jericho what's the weather", "what's the weather"],
    ["Hey Jericho, what's the weather?", "what's the weather?"],
    ["Hey, Jericho, lights off", "lights off"],
    ["hey jer lights off", "lights off"],
    ["okay jericho play music", "play music"],
    ["OK Jericho next song", "next song"],
    ["hi jericho", ""],
    ["hey jerico good morning", "good morning"],
    ["hey jerry co brief me", "brief me"],
    ["hey jerry-co brief me", "brief me"],
    ["jerryco set a timer", "set a timer"],
    ["jerr what time is it", "what time is it"],
    ["jeriko stop", "stop"],
    ["so um hey jericho what's on today", "what's on today"],
  ]) {
    const r = findWake(said, settingsWords);
    assert.equal(r.found, true, said);
    assert.equal(r.rest, rest, said);
    assert.doesNotMatch(r.rest, /^(hey|okay|ok|hi)\b/i, `"hey" is stripped: ${said}`);
  }
});

test("doesn't wake on look-alike words", () => {
  for (const said of ["Jerry turn on the lights", "Jeremy is here", "the jersey is red", "Jarvis lights on", "hey there", "okay let's go", "jerk chicken for dinner"]) {
    assert.equal(findWake(said, settingsWords).found, false, said);
  }
});

test("typed requests lose a leading wake word too", () => {
  assert.equal(stripLeadingWake("Hey Jericho, what's the score", settingsWords), "what's the score");
  assert.equal(stripLeadingWake("okay jer brief me", settingsWords), "brief me");
  assert.equal(stripLeadingWake("what's the score", settingsWords), "what's the score");
  assert.equal(stripLeadingWake("tell Jericho hi", settingsWords), "tell Jericho hi", "only at the start");
});
