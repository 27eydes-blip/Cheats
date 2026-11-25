// Cost: the stray-turn filter. Pure functions only: no timers, no server, no network.
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyFollowUp, echoOverlap, isAck, isNoise } from "../public/turnfilter.js";

const send = (text, opts) => classifyFollowUp(text, opts).send;

test("filler and noise never get sent", () => {
  for (const t of ["um", "uh", "hmm", "mm", "uh uh", "ummm", "oh", "haha", "so", "", "  "]) {
    assert.equal(isNoise(t), true, t);
    assert.equal(send(t), false, t);
    assert.equal(send(t, { askedQuestion: true }), false, `${t} (after a question)`);
  }
  assert.equal(isNoise("turn it up"), false);
});

test("acknowledgements only count after Jericho asked something", () => {
  for (const t of ["okay", "yeah", "cool", "ok cool", "right", "alright"]) {
    assert.equal(isAck(t), true, t);
    assert.equal(send(t), false, t);
    assert.equal(send(t, { askedQuestion: true }), true, `${t} answers a question`);
  }
});

test("clear follow-ups get through without the wake word", () => {
  for (const t of [
    "what about tomorrow",
    "turn it up",
    "and the kitchen too",
    "no I meant the bedroom",
    "can you make it louder",
    "how long will that take",
    "set another one for eight",
    "thanks",
    "that's not right",
    "my sister's name is Maya, please remember it",
  ]) {
    assert.equal(send(t), true, t);
  }
});

test("background TV, music and chatter that isn't for Jericho are dropped", () => {
  for (const t of [
    "she went to the store yesterday",
    "coming up after the break the weather with Jim",
    "baby baby baby oh",
    "the defense really stepped up in the second half and that made the difference for them tonight going into the playoffs with a lot of momentum and confidence at home",
  ]) {
    assert.equal(send(t), false, t);
  }
  // a long ramble that's clearly for Jericho still counts
  assert.equal(send("hey can you help me plan a birthday party for my nephew next weekend with about twelve kids and a budget of two hundred dollars and some games please"), true);
});

test("Jericho's own echo is dropped; the wake word or a barge-in always counts", () => {
  const lastSpoken = "it's sunny and seventy two degrees in birmingham right now";
  assert.ok(echoOverlap("sunny and seventy two degrees", lastSpoken) >= 0.9);
  assert.equal(classifyFollowUp("sunny and seventy two degrees", { lastSpoken }).reason, "echo");
  assert.equal(send("what about tomorrow", { lastSpoken }), true);
  assert.equal(send("she went to the store", { wakeHeard: true }), true);
  assert.equal(send("she went to the store", { interrupted: true }), true);
  assert.equal(send("um", { wakeHeard: true }), false, "the wake word plus filler is just the wake word");
});

test("very unsure transcripts are dropped; the filter can be turned off", () => {
  assert.equal(classifyFollowUp("what time is it", { confidence: 0.1 }).reason, "unclear");
  assert.equal(send("what time is it", { confidence: 0.9 }), true);
  assert.equal(send("what time is it", { confidence: 0 }), true, "0 means the browser didn't say");
  assert.equal(send("she went to the store", { enabled: false }), true);
  assert.equal(send("um", { enabled: false }), false, "filler is dropped even with the filter off");
});
