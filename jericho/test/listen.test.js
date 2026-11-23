// Always listening and the power-up: restart backoff, recognition errors, "go to sleep",
// wake sensitivity, room mode and calibration, and the sound/animation timeline.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { backoffDelay, calibrateRoom, classifyRecError, fuzzWake, isSleepCommand, pickWake, ROOM_FACTOR, roomGain, roomThreshold } from "../public/listen.js";
import { BOOT_FLASH_AT, powerUpPlan } from "../public/power.js";

const W = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8")).wakeWords;

test("recognition restarts with a growing backoff, capped at 5 s", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(backoffDelay), [250, 500, 1000, 2000, 4000, 5000, 5000]);
});

test("recognition errors: blocked and lost need a tap, the rest restart on their own", () => {
  assert.equal(classifyRecError("not-allowed"), "blocked");
  assert.equal(classifyRecError("service-not-allowed"), "blocked");
  assert.equal(classifyRecError("audio-capture"), "lost");
  assert.equal(classifyRecError("no-speech"), "quiet");
  assert.equal(classifyRecError("aborted"), "quiet");
  assert.equal(classifyRecError("network"), "retry");
});

test('"Jericho, go to sleep" mutes; a stray "sleep" doesn\'t', () => {
  for (const said of ["Jericho, go to sleep", "hey jericho go to sleep please", "go to sleep, Jericho", "Jer, mute", "okay jericho stop listening"]) {
    assert.equal(isSleepCommand(said, W), true, said);
  }
  assert.equal(isSleepCommand("go to sleep", W), false, "no wake word and no conversation");
  assert.equal(isSleepCommand("go to sleep", W, { inConversation: true }), true, "in a conversation the name isn't needed");
  for (const said of ["Jericho, sleep is important", "Jericho, how did you sleep", "jericho what time should I go to sleep", "Jericho, stop"]) {
    assert.equal(isSleepCommand(said, W), false, said);
  }
});

test("wake sensitivity: low needs the name first, normal anywhere, high checks every guess and near-misses", () => {
  assert.equal(pickWake(["hey Jericho lights on"], W, "low").found, true);
  assert.equal(pickWake(["Jericho"], W, "low").found, true);
  assert.equal(pickWake(["turn it off Jericho"], W, "low").found, false);
  assert.equal(pickWake(["turn it off Jericho"], W, "normal").found, true);
  assert.equal(pickWake(["the rico lights on", "jericho lights on"], W, "normal").found, false, "normal only trusts the best guess");
  const high = pickWake(["the rico lights on", "jericho lights on"], W, "high");
  assert.deepEqual([high.found, high.text], [true, "jericho lights on"]);
  assert.equal(pickWake(["jerichow what time is it"], W, "high").found, true);
  assert.equal(fuzzWake("Jerichoo, lights"), "jericho, lights");
  assert.equal(fuzzWake("the church is nice"), "the church is nice", "only near-misses change");
  assert.equal(pickWake(["Jeremy is here"], W, "high").found, false);
});

test("room mode loosens the threshold; calibration puts it between the room and your voice", () => {
  assert.equal(roomThreshold(0.15, { on: false }), 0.15);
  assert.equal(roomThreshold(0.15, { on: true }), 0.15 * ROOM_FACTOR);
  const t = roomThreshold(0.15, { on: true, noise: 0.01, voice: 0.06 });
  assert.ok(t > 0.01 * 2 && t < 0.06, `between noise and voice: ${t}`);
  assert.ok(roomThreshold(0.15, { on: true, noise: 0.05, voice: 0.4 }) <= 0.15, "never stricter than normal");
  assert.equal(roomGain({ on: false }), 1);
  assert.ok(roomGain({ on: true, voice: 0.07 }) > 1);

  const quiet = Array.from({ length: 120 }, () => 0.008 + Math.random() * 0.004);
  const voice = [...Array.from({ length: 160 }, () => 0.01), ...Array.from({ length: 80 }, () => 0.08 + Math.random() * 0.02)];
  const cal = calibrateRoom(quiet, voice);
  assert.equal(cal.ok, true);
  assert.ok(cal.noise < 0.013 && cal.voice > 0.07);
  const tooQuiet = calibrateRoom(quiet, quiet);
  assert.equal(tooQuiet.ok, false);
  assert.match(tooQuiet.reason, /couldn't hear you/);
});

test("power-up timeline: the orb's flash lands on the chime; reloads get a shorter version", () => {
  for (const kind of ["full", "short"]) {
    const p = powerUpPlan(kind);
    const flash = p.orbDelay + BOOT_FLASH_AT * p.orbDur;
    assert.ok(Math.abs(flash - p.chimeAt) < 1e-9, `${kind}: flash ${flash} vs chime ${p.chimeAt}`);
    assert.ok(p.sweepFrom < p.chimeAt, "rising tones lead up to the chime");
    assert.equal(p.humRise, p.chimeAt);
  }
  const full = powerUpPlan("full");
  const short = powerUpPlan("short");
  assert.ok(full.humRise >= 2 && full.total >= 4 && full.total <= 6, "about 2 s of rising hum, 4-6 s in all");
  assert.ok(short.total < full.total / 2);
  // the scene uses the same flash point
  const scene = fs.readFileSync(new URL("../public/presence/scene.js", import.meta.url), "utf8");
  assert.match(scene, /bootK - BOOT_FLASH_AT/);
});

test("the page has one power-on prompt, a mute button with M, and no Start/Stop buttons", () => {
  const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /id="power-prompt"[^>]*>.*Tap to power on/s);
  assert.match(html, /id="mute-btn"/);
  assert.match(html, /id="mic-live"/);
  assert.doesNotMatch(html, /id="stop-btn"/);
  for (const id of ["snd-power", "snd-vol", "snd-idle", "wake-sens", "room-mode", "room-cal"]) assert.match(html, new RegExp(`id="${id}"`));
  const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /e\.key === "m" \|\| e\.key === "M"/);
  assert.match(app, /e\.key === "Escape"/, "Esc still stops everything");
});
