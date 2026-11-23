// Jericho in the browser: ears (speech recognition + wake word), mouth (audio playback)
// and the gold visualizer. All thinking and all API keys live on the server.
import { createPresence } from "./presence/index.js";
import { wakeRegex as buildWakeRegex } from "./wake.js";
import { BARGE_DEFAULTS, BARGE_MODES, createBargeDetector, DEFAULT_BARGE_MODE, shouldDropAsEcho } from "./bargein.js";
import { createAlarmRinger, DEFAULT_ALARM_SOUND, DEFAULT_ALARM_VOLUME, normalizeSound, previewAlarm } from "./alarm.js";
import { alarmCommand } from "./alarmrules.js";
import { backoffDelay, calibrateRoom, classifyRecError, DEFAULT_SENSITIVITY, isSleepCommand, pickWake, roomGain, roomThreshold, SENSITIVITIES } from "./listen.js";

const $ = (id) => document.getElementById(id);
const orb = $("orb");
const orbLabel = $("orb-label");
const statusEl = $("status");
const heardEl = $("heard");
const logEl = $("log");
const confirmBox = $("confirm");
// The 3D presence (or the 2D visualizer without WebGL). Tapping it works like the old start button.
const viz = createPresence({ onTap: () => orb.click() });

// ---- identity & access token -------------------------------------------------
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const params = new URLSearchParams(location.search);
if (params.has("token")) {
  store.set("jericho-token", params.get("token"));
  history.replaceState(null, "", location.pathname); // keep the token out of the address bar
}
const token = store.get("jericho-token") || "";
let sessionId = store.get("jericho-session");
if (!sessionId) {
  sessionId = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
  store.set("jericho-session", sessionId);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-jericho-token": token },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new Error("Access token missing or wrong. Open the page with ?token=…");
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res.json();
}

// ---- UI helpers ---------------------------------------------------------------
// off      not started (tap the orb)
// idle     waiting for the wake word
// active   in a conversation: no wake word needed until the timeout runs out
// thinking / speaking / confirm   as they say
let mode = "off";
// always listening: mute, a lost mic, and the recognizer's own state (see "power on" below)
let muted = false;
let micLost = false;
let recActive = false;
let recStartedAt = 0;
let recFailures = 0;
let restartTimer;
let lastStartAttempt = 0;
// far-field settings (see "far-field" below)
const SENS_KEY = "jericho-wake-sensitivity";
const ROOM_KEY = "jericho-room";
let wakeSensitivity = SENSITIVITIES.includes(store.get(SENS_KEY)) ? store.get(SENS_KEY) : DEFAULT_SENSITIVITY;
let room = (() => {
  try {
    return JSON.parse(store.get(ROOM_KEY) || "{}") || {};
  } catch {
    return {};
  }
})();
let calibration = null; // { phase: "quiet" | "voice", quiet: [], voice: [] }
let alarmRinging = null; // the alarm that's ringing (it overrides mute and conversations)
function setMode(m, status) {
  mode = m;
  orb.dataset.state = m;
  viz.setState(m);
  orbLabel.textContent = {
    off: "Tap to power on",
    idle: `Say ${config.assistantName}`,
    muted: "Muted",
    lost: "Mic lost",
    active: "Listening",
    thinking: "Thinking",
    speaking: "Speaking",
    confirm: "Yes / No?",
  }[m];
  orb.setAttribute(
    "aria-label",
    { off: "Power on Jericho", muted: "Unmute", lost: "Reconnect the microphone", speaking: "Interrupt Jericho", thinking: "Stop Jericho", confirm: "Cancel the waiting action" }[m] || "Jericho is listening",
  );
  confirmBox.hidden = m !== "confirm";
  if (status !== undefined) statusEl.textContent = status;
  updateMicIndicator();
}
function addLog(who, text) {
  const li = document.createElement("li");
  li.className = who;
  li.textContent = text;
  logEl.prepend(li);
  while (logEl.children.length > 30) logEl.lastChild.remove();
  return li;
}

// ---- config ---------------------------------------------------------------------
let config = {
  assistantName: "Jericho",
  wakeWords: ["jericho", "jer"],
  endPhrases: ["thanks jericho", "that's all", "go to sleep"],
  conversationTimeoutSeconds: 30,
  speechLang: "en-US",
  elevenLabsEnabled: false,
};
api("/api/config")
  .then((c) => {
    config = { ...config, ...c };
    applyBargeSettings();
    $("name").textContent = c.assistantName;
    if (mode === "off" || mode === "idle") setMode(mode);
    document.title = c.assistantName;
  })
  .catch((e) => (statusEl.textContent = e.message));

// ---- voice out ---------------------------------------------------------------------
// Replies arrive a sentence at a time. Two audio players take turns: while one speaks a
// sentence, the other is already downloading the next, so there's no gap between them.
const players = [new Audio(), new Audio()];
for (const p of players) p.preload = "auto";
let audioCtx;
let speechQueue = Promise.resolve();

function sleepTone() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.setValueAtTime(660, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(330, audioCtx.currentTime + 0.25);
  gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.32);
}

function beep() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.2);
}

// ElevenLabs audio goes through an AnalyserNode so the bars follow the real voice.
let voiceAnalyser = null;
let duckGain = null;
const routed = new Set();
function routeThroughAnalyser(player) {
  if (routed.has(player)) return true;
  if (!audioCtx || audioCtx.state !== "running") return false; // a suspended graph would mute the voice
  try {
    if (!voiceAnalyser) {
      voiceAnalyser = audioCtx.createAnalyser();
      voiceAnalyser.fftSize = 256;
      voiceAnalyser.smoothingTimeConstant = 0.72;
      // analyser -> duck gain -> speakers: the visualizer sees the full voice, the room hears it a bit lower
      duckGain = audioCtx.createGain();
      voiceAnalyser.connect(duckGain);
      duckGain.connect(audioCtx.destination);
    }
    audioCtx.createMediaElementSource(player).connect(voiceAnalyser);
    routed.add(player);
  } catch {
    /* not supported: the bars fall back to a fake pulse */
  }
  return routed.has(player);
}

const ttsUrl = (text) => `/api/tts?${new URLSearchParams({ text, token })}`;
let currentPlayer = null;

/** The player holding this sentence's audio, or a free one that starts loading it now. */
function assignPlayer(text, avoid) {
  const url = ttsUrl(text);
  let player = players.find((p) => p.dataset.url === url);
  if (!player) {
    player = players.find((p) => p !== avoid && !p.dataset.url) || players.find((p) => p !== avoid) || players[0];
    player.dataset.url = url;
    player.src = url;
    player.load();
  }
  return player;
}

/** Start downloading the next sentence on the player that isn't speaking. */
function preload(text) {
  assignPlayer(text, currentPlayer);
}

function browserVoice(text, stats) {
  viz.setSpeechSource(null, true); // no audio to analyse: smooth fake pulse
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = config.speechLang;
    u.volume = voiceVolume();
    u.onstart = () => { stats.firstAudio ??= performance.now(); replyAudioStarted(stats); };
    // Chrome sometimes never fires onend (long sentences, or right after a cancel): don't wait forever
    const guard = setTimeout(() => resolve(), 6000 + text.length * 120);
    u.onend = u.onerror = () => {
      clearTimeout(guard);
      resolve();
    };
    speechSynthesis.speak(u);
  });
}

async function elevenLabsVoice(text, stats, next) {
  if (audioCtx && audioCtx.state !== "running") await Promise.race([audioCtx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 300))]);
  const player = assignPlayer(text, null);
  currentPlayer = player;
  if (next) preload(next); // the other player fetches the next sentence while this one speaks
  const isRouted = routeThroughAnalyser(player);
  viz.setSpeechSource(isRouted ? voiceAnalyser : null, !isRouted);
  applyVoiceVolume(player, isRouted);
  return new Promise((resolve, reject) => {
    let started = false;
    let lastProgress = performance.now();
    const cleanup = () => {
      player.onended = player.onerror = player.onplaying = player.ontimeupdate = null;
      player.dataset.url = "";
      clearTimeout(stall);
      clearInterval(watchdog);
    };
    // If audio hasn't started within 7s, give up and use the browser voice.
    const stall = setTimeout(() => { if (!started) { cleanup(); player.pause(); reject(new Error("TTS stalled")); } }, 7000);
    // ...and if it started but stopped moving (the stream stalled mid-sentence), don't wait forever either
    const watchdog = setInterval(() => {
      if (started && !player.paused && performance.now() - lastProgress > 8000) {
        cleanup();
        player.pause();
        reject(new Error("TTS stalled mid-sentence"));
      }
    }, 1000);
    player.ontimeupdate = () => (lastProgress = performance.now());
    player.onplaying = () => { started = true; lastProgress = performance.now(); stats.firstAudio ??= performance.now(); replyAudioStarted(stats); };
    player.onended = () => { cleanup(); resolve(); };
    player.onerror = () => { cleanup(); reject(new Error("TTS failed")); };
    player.play().catch((e) => { cleanup(); reject(e); });
  });
}

/** One reply from Jericho: sentences are pushed in as they arrive and spoken in order. */
const liveTurns = new Set(); // replies being spoken or waiting to be (the kill switch empties these)
function createTurn() {
  let wake = null;
  const turn = {
    cancelled: false,
    queue: [],
    done: false,
    useBrowser: !config.elevenLabsEnabled,
    playing: false,
    stats: { voices: new Set() },
    push(sentence) {
      turn.queue.push(sentence);
      if (turn.playing && turn.queue.length === 1 && !turn.useBrowser) preload(sentence);
      wake?.();
    },
    finish() {
      turn.done = true;
      wake?.();
    },
    next: () => new Promise((r) => (wake = r)),
  };
  liveTurns.add(turn);
  return turn;
}

async function playTurn(turn) {
  lastSpoken = "";
  for (;;) {
    if (turn.cancelled) break;
    if (turn.queue.length === 0) {
      if (turn.done) break;
      if (mode === "speaking") setMode("thinking", ""); // more of the reply is on its way
      await turn.next();
      continue;
    }
    const sentence = turn.queue.shift();
    if (mode !== "speaking") {
      stopConversationTimer();
      // Speech recognition is paused while he talks, so it can't transcribe his own voice.
      // On a PC a separate echo-cancelled mic stream keeps measuring the level; a confirmed
      // interruption (loud enough, long enough) is what turns recognition back on.
      if (!earsDuringReply) stopListening();
      setMode("speaking", "");
    }
    turn.playing = true;
    lastSpoken = `${lastSpoken} ${normalize(sentence)}`;
    currentSentence = sentence;
    recentSentences.push(sentence);
    if (recentSentences.length > 3) recentSentences.shift();
    if (!turn.useBrowser) {
      try {
        await elevenLabsVoice(sentence, turn.stats, turn.queue[0]);
        turn.stats.voices.add("elevenlabs");
        continue;
      } catch {
        turn.useBrowser = true; // ElevenLabs failed: browser voice for the rest of this reply
      }
    }
    await browserVoice(sentence, turn.stats);
    turn.stats.voices.add("browser");
  }
  turn.playing = false;
  liveTurns.delete(turn);
  currentSentence = "";
  if (!replyPlaying()) {
    barge.stop();
    earsDuringReply = false;
    tailUntil = performance.now() + echoTailMs(); // room echo and speaker decay
  }
  turn.stats.end = performance.now();
  viz.setSpeechSource(null, false);
  if (turn.cancelled) return; // stopped: the kill switch already set things straight
  afterSpeaking();
}

/** Speak a whole piece of text (announcements, errors). */
function speak(text) {
  const turn = createTurn();
  turn.push(text);
  turn.finish();
  speechQueue = speechQueue.then(() => playTurn(turn)).catch(() => {}); // one failure never blocks later speech
  return speechQueue;
}

function afterSpeaking() {
  if (confirmPending) setMode("confirm", muted ? "Muted: tap Yes or No." : "Say “yes” or “confirm” to go ahead.");
  else if (muted || micLost) restingMode();
  else if (endAfterReply) endConversation();
  else if (conversation && running) {
    setMode("active", "Listening… (no need to say my name)");
    restartConversationTimer(); // Jericho finished talking: timer starts again
  } else if (running) setMode("idle", `Say “${config.assistantName}”…`);
  else setMode("off", "Tap to power on.");
  endAfterReply = false;
  // The echo tail: the mic stays deaf a moment longer, so room echo isn't transcribed.
  if (running) setTimeout(() => !replyPlaying() && startListening(), echoTailMs());
}

// ---- conversation (stays open after the wake word) ------------------------------
let conversation = false;
let conversationTimer;
let endAfterReply = false;

function restartConversationTimer() {
  clearTimeout(conversationTimer);
  if (!conversation) return;
  conversationTimer = setTimeout(() => {
    if (mode === "active") endConversation();
  }, (config.conversationTimeoutSeconds || 30) * 1000);
}
function stopConversationTimer() {
  clearTimeout(conversationTimer);
}
function startConversation() {
  conversation = true;
  setMode("active", "Listening… (no need to say my name)");
  restartConversationTimer();
}
/** Tell the server a conversation finished, so it can learn how you talk (one small call). */
function conversationFinished() {
  api("/api/conversation-end", { sessionId }).catch(() => {});
}

function endConversation() {
  if (conversation) conversationFinished();
  conversation = false;
  stopConversationTimer();
  if (running && (muted || micLost)) restingMode();
  else if (running) {
    sleepTone();
    setMode("idle", `Say “${config.assistantName}”…`);
  } else setMode("off", "Tap to power on.");
}

// ---- brain round trips ----------------------------------------------------------
let confirmTimer;
let confirmPending = false;
let lastUtterance = null; // timing of the last thing you said (see the ears section)

async function send(kind, text, { endAfter = false, typed = false, interrupted = false } = {}) {
  addLog("you", text);
  stopConversationTimer();
  setMode("thinking", "Thinking…");
  const turn = createTurn();
  const spoken = lastUtterance && performance.now() - lastUtterance.final < 2000 ? lastUtterance : null;
  lastUtterance = null;
  Object.assign(turn.stats, { final: spoken?.final ?? performance.now(), first: spoken?.first, last: spoken?.last });
  const playing = (speechQueue = speechQueue.then(() => playTurn(turn)).catch((e) => console.warn("speech failed:", e)));

  let result = { awaitingConfirmation: false };
  let bubble = null;
  const controller = new AbortController();
  currentRequest = controller;
  try {
    const res = await fetch(kind === "confirm" ? "/api/confirm" : "/api/ask", {
      signal: controller.signal,
      method: "POST",
      headers: { "content-type": "application/json", "x-jericho-token": token },
      // how long you spoke for, so Jericho can tell if you're rushed or relaxed
      body: JSON.stringify({ sessionId, text, typed, interrupted: interrupted || undefined, speechMs: spoken?.first != null ? Math.round(spoken.last - spoken.first) : undefined }),
    });
    if (res.status === 401) throw new Error("Access token missing or wrong. Open the page with ?token=…");
    if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.type === "sentence") {
          turn.stats.firstSentence ??= performance.now();
          turn.push(msg.text);
          bubble ||= addLog("jericho", "");
          bubble.textContent = bubble.textContent ? `${bubble.textContent} ${msg.text}` : msg.text;
        } else if (msg.type === "card") {
          addCard(msg.card);
        } else if (msg.type === "done") {
          result = msg;
          if (msg.sources?.length) addSources(bubble || addLog("jericho", ""), msg.sources);
        }
      }
    }
  } catch (e) {
    if (!controller.signal.aborted) {
      addLog("note", e.message);
      turn.push("Sorry, I couldn't reach the server.");
    }
  }
  if (currentRequest === controller) currentRequest = null;
  if (turn.cancelled) return; // stopped: nothing more to say

  clearTimeout(confirmTimer);
  confirmPending = Boolean(result.awaitingConfirmation);
  endAfterReply = endAfter && !confirmPending; // never skip past a pending yes/no
  if (confirmPending) {
    confirmTimer = setTimeout(() => {
      if (mode === "confirm") {
        confirmPending = false;
        if (conversation) conversationFinished();
        conversation = false;
        setMode("idle", "Confirmation timed out.");
      }
    }, 60_000);
  }
  turn.finish();
  await playing;
  reportTiming(turn.stats, result.timings);
}

// ---- chat panel extras: web links and the Briefing card (built from elements, never HTML text) ----
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** Links under an answer that used web search (they're never read aloud). */
function addSources(bubble, sources) {
  const box = node("span", "sources");
  for (const s of sources) {
    let host = "";
    try {
      host = new URL(s.url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    const a = node("a", "", s.title.length > 60 ? `${s.title.slice(0, 57)}…` : s.title);
    a.href = s.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = host;
    box.append(a);
  }
  if (box.children.length) bubble.append(box);
}

/** The Briefing card: the same info Jericho reads out. */
function addCard(card) {
  if (card?.kind !== "briefing") return;
  const li = node("li", "card briefing");
  li.append(node("p", "card-title", `Briefing · ${card.date}`));
  const section = (label, part, fill) => {
    const sec = node("div", "card-section");
    sec.append(node("p", "card-label", label));
    if (!part?.ok) sec.append(node("p", "card-skip", `Skipped: ${part?.reason || "unavailable"}`));
    else fill(sec);
    li.append(sec);
  };
  section("Calendar", card.calendar, (sec) => {
    if (!card.calendar.today.length) sec.append(node("p", "", "Nothing on today."));
    for (const e of card.calendar.today) sec.append(node("p", "", `${e.time} · ${e.title}`));
    if (card.calendar.tomorrowFirst) sec.append(node("p", "card-muted", `Tomorrow: ${card.calendar.tomorrowFirst.time} · ${card.calendar.tomorrowFirst.title}`));
  });
  section("Weather", card.weather, (sec) => {
    const w = card.weather;
    sec.append(node("p", "", `${w.place}: ${w.now}°${w.units}, ${w.sky}. High ${w.high}°, low ${w.low}°, rain ${w.rain}%.`));
    sec.append(node("p", "card-muted", w.advice));
    if (w.tomorrow) sec.append(node("p", "card-muted", `Tomorrow: high ${w.tomorrow.high}°, low ${w.tomorrow.low}°, ${w.tomorrow.sky}, rain ${w.tomorrow.rain}%.`));
  });
  section("Markets", card.markets, (sec) => {
    for (const q of card.markets.quotes) {
      if (!q.ok) {
        sec.append(node("p", "card-muted", `${q.name}: unavailable`));
        continue;
      }
      const arrow = q.direction === "up" ? "▲" : q.direction === "down" ? "▼" : "•";
      const row = node("p", `quote ${q.direction}`, `${arrow} ${q.name} ${q.changePct > 0 ? "+" : ""}${q.changePct.toFixed(2)}% `);
      row.append(node("span", "card-muted", q.basis));
      sec.append(row);
    }
  });
  li.append(node("p", "card-note", card.markets?.disclaimer || "Market moves are for information only, not financial advice."));
  logEl.prepend(li);
}

// ---- barge-in: talk over Jericho and he stops and listens ------------------------------------
// PC: the mic stays on while he talks. It only counts as an interruption when your voice is
// clearly louder than his echo, for about a quarter second, and the words aren't his own.
// Phones: tap the light (or press Stop) to cut him off.
// Interrupting only stops his reply: tools, Claude Code jobs and calls keep running, and it
// never counts as a "yes". Only the kill phrase, the Stop button or Esc stop everything.
const BARGE_KEY = "jericho-barge-mode";
let bargeMode = BARGE_MODES[store.get(BARGE_KEY)] !== undefined ? store.get(BARGE_KEY) : DEFAULT_BARGE_MODE;
let barge = createBargeDetector({}, bargeMode); // re-created with the server's settings once they load
let currentSentence = "";
let bargeUtterance = null; // set when you cut him off: the words you're saying are your next request

function replyPlaying() {
  for (const t of liveTurns) if (t.playing && !t.cancelled) return true;
  return false;
}
let earsDuringReply = false; // recognition turned back on during a reply ("Jericho, stop" with interrupting off)
let tailUntil = 0; // until then, transcripts that sound like his last sentences are dropped
const recentSentences = []; // his last 3 sentences, for echo matching
let echoIgnored = 0;
const echoTailMs = () => config.bargeIn?.echoTailMs ?? BARGE_DEFAULTS.echoTailMs;

/** PC with a working level meter: barge-in by voice is possible (phones: tap instead). */
function canListenForBargeIn() {
  return !isPhone && Boolean(micAnalyser) && running;
}
function replyAudioStarted(stats) {
  if (stats.bargeCalibrated) return;
  stats.bargeCalibrated = true;
  barge.startReply(performance.now()); // the next 1.5 seconds measure his echo
}

/** His voice is a little lower while the mic listens for interruptions (less leaks back in). */
function voiceVolume() {
  return canListenForBargeIn() && bargeMode !== "off" && barge.enabled ? (config.bargeIn?.duckTo ?? BARGE_DEFAULTS.duckTo) : 1;
}
function applyVoiceVolume(player, isRouted) {
  const v = voiceVolume();
  if (isRouted && duckGain) {
    duckGain.gain.cancelScheduledValues(audioCtx.currentTime);
    duckGain.gain.value = v;
    player.volume = 1;
  } else player.volume = v;
}

/** Drop transcripts that are his own voice coming back (and count them). */
function dropAsEcho(text, utteranceStart = heardTimes.first, count = true) {
  const drop = shouldDropAsEcho({ text, recent: recentSentences, now: performance.now(), speaking: replyPlaying(), tailUntil, utteranceStart: utteranceStart ?? null });
  if (drop && count) {
    echoIgnored++;
    console.debug("[jericho] echo ignored:", text);
  }
  return drop;
}

/** The level meter confirmed you're talking over him: loud enough, for long enough. */
function levelConfirmed() {
  if (bargeMode !== "off" && barge.enabled) return cutOff("voice");
  // Interrupting is off: still listen for "Jericho, stop" (only the kill phrase gets through).
  if (!earsDuringReply) {
    earsDuringReply = true;
    startListening();
  }
}

/** Fade the voice out over about 100 ms, then stop it. */
function fadeOut(player, ms = 100) {
  if (player.paused) return;
  if (routed.has(player) && duckGain && audioCtx) {
    const g = duckGain.gain;
    const t = audioCtx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + ms / 1000);
  }
  const start = performance.now();
  const from = player.volume;
  const step = () => {
    const k = Math.min(1, (performance.now() - start) / ms);
    player.volume = from * (1 - k);
    if (k < 1) return requestAnimationFrame(step);
    player.pause();
    player.volume = 1;
    player.onended?.(); // lets the sentence that was playing finish its wait
  };
  requestAnimationFrame(step);
}

/** Stop talking and listen. `heard`: the words that cut him off, if they're already final. */
function cutOff(how, heard = null) {
  api("/api/interrupt", { sessionId }).catch(() => {}); // stops the reply only; tools keep going
  currentRequest?.abort();
  currentRequest = null;
  for (const t of liveTurns) {
    t.cancelled = true;
    t.queue.length = 0;
    t.finish();
  }
  for (const p of players) fadeOut(p);
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  viz.setSpeechSource(null, false);
  barge.stop();
  earsDuringReply = false;
  tailUntil = performance.now() + echoTailMs(); // listening again, but his echo is still dropped
  endAfterReply = false;
  addLog("note", how === "tap" ? "Interrupted." : "Interrupted. Listening…");
  if (confirmPending) setMode("confirm", "Stopped. Say “yes” to confirm or “no” to cancel.");
  else {
    if (running) conversation = true; // no wake word needed: you're already talking to him
    setMode("active", "Listening…");
    restartConversationTimer();
  }
  if (running) setTimeout(() => startListening(), isPhone ? 150 : 0);
  if (heard) return onHeard(heard, true);
  if (how === "voice") bargeUtterance = { at: performance.now() };
}

// "Interrupt while talking" in the settings panel (the sun icon). Saved in this browser.
const bargeSelect = $("barge-mode");
if (bargeSelect) {
  bargeSelect.value = bargeMode;
  bargeSelect.addEventListener("change", () => {
    bargeMode = bargeSelect.value;
    store.set(BARGE_KEY, bargeMode);
    barge.setMode(bargeMode);
  });
  const note = $("barge-note");
  if (note && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) note.textContent = "On phones the mic is off while I talk: tap the light or press Stop to interrupt.";
}
$("barge-recal")?.addEventListener("click", () => {
  barge.recalibrate(replyPlaying() ? performance.now() : null);
  const note = $("barge-note");
  if (note) note.textContent = "Re-calibrating: I'll measure my echo during the next second and a half I talk.";
});
let debugAt = 0;
function showBargeDebug(level, now) {
  if (now - debugAt < 200) return;
  debugAt = now;
  const el = $("barge-debug");
  if (!el || el.offsetParent === null) return; // panel closed
  const ears = replyPlaying() ? (earsDuringReply ? "listening for stop" : "ears paused") : now < tailUntil ? "echo tail" : "listening";
  const cal = barge.calibrating(now) ? " · calibrating" : "";
  el.textContent = micAnalyser
    ? `Mic ${level.toFixed(2)} · threshold ${barge.threshold(now).toFixed(2)} · echo ignored ${echoIgnored} · ${ears}${cal}`
    : `No mic meter here (phone or mic blocked) · echo ignored ${echoIgnored}`;
}
function applyBargeSettings() {
  const base = config.bargeIn || {};
  // room mode loosens the level you need to reach to count as talking
  barge = createBargeDetector({ ...base, minLevel: roomThreshold(base.minLevel ?? BARGE_DEFAULTS.minLevel, room) }, bargeMode);
}

// ---- kill switch: "Jericho, stop", "cancel everything", the Stop button or Esc -------------
let currentRequest = null;
const KILL = new Set(["stop", "stop it", "stop now", "stop that", "stop everything", "stop all", "stop all of it", "cancel everything", "cancel all", "cancel all of it", "cancel it all", "cancel that", "cancel", "abort", "abort everything", "abort all", "halt", "never mind stop", "stop stop"]);
function isKillPhrase(text) {
  const t = String(text).toLowerCase().replace(/[’']/g, "").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/^(hey |ok |okay )?(jericho|jer|jerico|jerry co|jerr)\b ?/, "")
    .replace(/ (please|now|right now|jericho)$/, "").trim();
  return KILL.has(t);
}

/** Stops speech, the request in flight and everything running on the server; clears any waiting yes/no. */
function stopEverything() {
  if (alarmRinging) endAlarmLocal(); // the server's kill switch stops the alarm as well
  api("/api/stop", { sessionId }).catch(() => {});
  currentRequest?.abort();
  currentRequest = null;
  for (const t of liveTurns) {
    t.cancelled = true;
    t.queue.length = 0;
    t.finish();
  }
  for (const p of players) {
    p.pause();
    p.onended?.(); // lets the sentence that was playing finish its wait at once
  }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  viz.setSpeechSource(null, false);
  clearTimeout(confirmTimer);
  confirmPending = false;
  endAfterReply = false;
  addLog("note", "Stopped.");
  if (running && (muted || micLost)) restingMode();
  else if (conversation && running) {
    setMode("active", "Stopped. Listening…");
    restartConversationTimer();
  } else setMode(running ? "idle" : "off", "Stopped.");
  if (running) setTimeout(() => startListening(), 200);
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && alarmRinging) return stopAlarm();
  if (e.key === "Escape" && ["thinking", "speaking", "confirm"].includes(mode)) stopEverything();
  // M mutes and unmutes (not while typing)
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || e.target?.isContentEditable;
  if ((e.key === "m" || e.key === "M") && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && running) {
    e.preventDefault();
    setMuted(!muted);
  }
});

/** Logs how long each step took, so slow spots show up in logs/actions.log. */
function reportTiming(st, server) {
  const d = (a, b) => (a != null && b != null ? Math.round(b - a) : undefined);
  const voices = [...st.voices];
  api("/api/timing", {
    sessionId,
    listeningMs: d(st.first, st.final),
    stoppedTalkingToFinalMs: d(st.last, st.final),
    thinkingMs: d(st.final, st.firstSentence),
    firstAudioMs: d(st.final, st.firstAudio),
    stoppedTalkingToAudioMs: d(st.last, st.firstAudio),
    totalMs: d(st.final, st.end),
    voice: voices.length > 1 ? "mixed" : voices[0],
    server,
  }).catch(() => {});
}

/** The wake word was heard: let the server warm Claude's cache for this conversation. */
let lastWarm = -Infinity;
function warmUp() {
  if (performance.now() - lastWarm < 60_000) return;
  lastWarm = performance.now();
  api("/api/warm", { sessionId }).catch(() => {});
}

// ---- ears --------------------------------------------------------------------------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec;
let wantListening = false;
let lastSpoken = "";

function normalize(t) {
  return String(t).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
}

function escapeWords(list) {
  // Longest first, so "jerry co" wins over "jer". A space in a phrase also
  // matches a hyphen or no gap at all ("jerry co" = "jerry-co" = "jerryco").
  return [...list]
    .sort((a, b) => b.length - a.length)
    .map((w) => w.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]*"))
    .join("|");
}

// "Jericho", "Hey Jericho", "Okay Jer", "Hey, Jerico"... (see wake.js)
function wakeRegex(flags = "i") {
  return buildWakeRegex(config.wakeWords, flags);
}

/** If the utterance contains an end phrase, return what's left once it (and any wake word) is removed. */
function splitEndPhrase(text) {
  const t = normalize(text);
  const re = new RegExp(`\\b(?:${escapeWords(config.endPhrases || [])})\\b`, "i");
  if (!config.endPhrases?.length || !re.test(t)) return null;
  return t.replace(re, " ").replace(wakeRegex("gi"), " ").replace(/\s+/g, " ").trim();
}

/** Did the mic just pick up Jericho's own last reply (speakerphone echo)? */
function isEcho(text) {
  const t = normalize(text);
  return t.length > 8 && lastSpoken.includes(t);
}

// Shows the thinking animation as soon as you stop talking, before the browser has
// finished its final transcript (which can take most of a second).
let heardTimes = { first: null, last: null };
let settleTimer;
let preThinkingFrom = null;

function onInterim(text) {
  const now = performance.now();
  heardTimes.first ??= now;
  heardTimes.last = now;
  const forUs = mode === "active" || mode === "confirm" || (mode === "idle" && wakeRegex().test(text));
  if (mode === "idle" && wakeRegex().test(text)) warmUp();
  clearTimeout(settleTimer);
  if (!forUs) return;
  settleTimer = setTimeout(() => {
    if (mode !== "active" && mode !== "confirm" && mode !== "idle") return;
    if (mode === "idle" && !wakeRegex().test(text)) return;
    preThinkingFrom = mode;
    stopConversationTimer();
    setMode("thinking", "");
    // If no final transcript turns up, go back to how things were.
    settleTimer = setTimeout(() => {
      if (preThinkingFrom && mode === "thinking") {
        setMode(preThinkingFrom, preThinkingFrom === "confirm" ? "Say “yes” or “confirm” to go ahead." : undefined);
        if (preThinkingFrom === "active") restartConversationTimer();
        preThinkingFrom = null;
      }
    }, 2500);
  }, 600);
}

function onHeard(raw, fromBargeIn = false, wakeOk = true) {
  clearTimeout(settleTimer);
  if (preThinkingFrom) {
    mode = preThinkingFrom; // carry on as if the animation hadn't switched yet
    preThinkingFrom = null;
  }
  lastUtterance = { first: heardTimes.first, last: heardTimes.last ?? performance.now(), final: performance.now() };
  const utteranceStart = heardTimes.first ?? performance.now();
  heardTimes = { first: null, last: null };
  const text = raw.trim();
  if (!text) return;
  // A ringing alarm comes first: only "stop" and "snooze" count, no wake word needed.
  if (alarmRinging) {
    alarmHeard(text, true);
    return;
  }
  // His own voice coming back (while he talks, in the echo tail, or in the first 400 ms of
  // what was heard): dropped, never sent to the brain.
  if (dropAsEcho(text, utteranceStart)) return;
  // The kill switch works in every state, even while Jericho is talking or thinking.
  if (mode !== "off" && isKillPhrase(text)) return stopEverything();
  // Anything else heard while he's still talking is discarded.
  if (replyPlaying()) return;
  if (calibration) return; // calibrating the room: saying "Jericho" mustn't wake him
  // "Jericho, go to sleep": mute (a tap or M unmutes)
  if ((mode === "idle" || mode === "active") && isSleepCommand(text, config.wakeWords, { inConversation: mode === "active" })) {
    addLog("note", "Muted. Tap the light or press M to listen again.");
    return setMuted(true);
  }
  // The words that cut him off are your next request (no wake word needed).
  let interrupted = fromBargeIn;
  if (bargeUtterance) {
    interrupted = interrupted || performance.now() - bargeUtterance.at < 8000;
    bargeUtterance = null;
  }
  if (!interrupted && isEcho(text)) return;

  // Safety confirmations work exactly as before: whatever you say goes to the
  // server, which only accepts a clear yes. "That's all" here is a no, then sleep.
  if (mode === "confirm") {
    const ending = splitEndPhrase(text) !== null;
    return send("confirm", text, { endAfter: ending, interrupted }); // a "yes" said over him never counts
  }

  if (mode === "active") {
    restartConversationTimer(); // you spoke: timer starts again
    const rest = splitEndPhrase(text);
    if (rest !== null) {
      // "Thanks Jericho" ends it now. "Lights off, that's all" does the request first.
      return rest.length > 2 ? send("ask", rest, { endAfter: true, interrupted }) : endConversation();
    }
    const request = text.replace(wakeRegex(), " ").trim();
    if (request.length > 1) return send("ask", request, { interrupted });
    beep(); // just the wake word again: still listening
    return;
  }

  if (mode !== "idle") return; // thinking or speaking: ignore
  if (splitEndPhrase(text) !== null) return; // "thanks Jericho" while asleep: stay asleep
  if (!wakeOk) return; // low sensitivity: the wake word has to open the sentence
  const m = wakeRegex().exec(text);
  if (!m) return; // not for us
  const rest = text.slice(m.index + m[0].length).trim();
  if (rest.length > 1) {
    conversation = true; // "Jericho, turn on the lights": answer, then keep listening
    return send("ask", rest);
  }
  beep(); // just "Jericho": wait for the request
  warmUp();
  startConversation();
}

function startListening() {
  if (!rec || micLost || ((muted || !running) && !alarmRinging)) return;
  wantListening = true;
  lastStartAttempt = performance.now();
  try { rec.start(); } catch { /* already running */ }
}
function stopListening() {
  wantListening = false;
  try { rec?.abort(); } catch { /* not running */ }
}

if (SR) {
  rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 3; // High wake sensitivity also checks the second and third guesses
  rec.onresult = (e) => {
    recFailures = 0; // it's working
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        const alts = Array.from({ length: r.length }, (_, k) => r[k].transcript);
        const pick = pickWake(alts, config.wakeWords, wakeSensitivity);
        onHeard(pick.found ? pick.text : alts[0], false, wakeSensitivity !== "low" || pick.found);
      } else interim += r[0].transcript;
    }
    if (alarmRinging) {
      if (interim) alarmHeard(interim, false); // "stop" acts at once, over the alarm
      return;
    }
    if (replyPlaying()) return; // still talking: transcripts are discarded (only the kill phrase gets through)
    if (interim && dropAsEcho(interim, heardTimes.first, false)) return; // his echo: no thinking animation, no timer reset
    heardEl.textContent = interim;
    if (interim) onInterim(interim);
    if (interim && mode === "active") restartConversationTimer();
    micPulse = Math.min(1, micPulse + 0.18); // works even where we can't meter the mic
  };
  rec.onstart = () => {
    recActive = true;
    recStartedAt = performance.now();
    updateMicIndicator();
  };
  rec.onerror = (e) => {
    const kind = classifyRecError(e.error);
    if (kind === "blocked") return setMicLost("Microphone blocked. Allow mic access for this page (and use HTTPS on the phone), then tap to reconnect.");
    if (kind === "lost") return setMicLost();
    if (kind === "retry") recFailures++;
  };
  // Browsers stop listening every so often, and errors end it too: restart on its own, with a
  // backoff if it keeps failing straight away.
  rec.onend = () => {
    recActive = false;
    if (performance.now() - recStartedAt < 2000) recFailures++;
    else recFailures = 0;
    updateMicIndicator();
    clearTimeout(restartTimer);
    if (wantListening && (!muted || alarmRinging) && !micLost) restartTimer = setTimeout(() => wantListening && startListening(), backoffDelay(Math.max(0, recFailures - 1)));
  };
}

// ---- mic volume for the visualizer -----------------------------------------------
// Desktop: a real level meter on the mic. Phones: speech recognition and a second mic
// stream can fight over the microphone, so there the bars react to recognition activity.
const isPhone = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
let micStream = null;
let micAnalyser = null;
let micPulse = 0;
let micBuf = null;

let micStarting = false;
async function startMicMeter() {
  if (isPhone || micStream || micStarting || (muted && !alarmRinging) || micLost || !navigator.mediaDevices?.getUserMedia || !audioCtx) return;
  micStarting = true;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    micStarting = false;
    if ((!running || muted) && !alarmRinging) return stopMicMeter();
    if (micLost) return stopMicMeter();
    // unplugged or taken away by the system
    for (const track of micStream.getAudioTracks()) track.onended = () => setMicLost();
    micAnalyser = audioCtx.createAnalyser();
    micAnalyser.fftSize = 512;
    audioCtx.createMediaStreamSource(micStream).connect(micAnalyser); // analysed only, never played
    micBuf = new Float32Array(micAnalyser.fftSize);
  } catch (err) {
    micStarting = false;
    micStream = null;
    if (err?.name === "NotAllowedError") setMicLost("Microphone blocked. Allow mic access for this page, then tap to reconnect.");
    else if (err?.name === "NotFoundError" || err?.name === "NotReadableError") setMicLost();
  }
}
function stopMicMeter() {
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = null;
  micAnalyser = null;
}
(function meterLoop() {
  let level = 0;
  if (micAnalyser && micBuf) {
    micAnalyser.getFloatTimeDomainData(micBuf);
    let sum = 0;
    for (let i = 0; i < micBuf.length; i++) sum += micBuf[i] * micBuf[i];
    level = Math.sqrt(sum / micBuf.length) * 4;
    const now = performance.now();
    if (replyPlaying() && canListenForBargeIn()) {
      barge.level(level, now);
      if (barge.sustained(now, 80)) levelConfirmed();
    }
    if (calibration) calibration[calibration.phase].push(level);
    if (alarmRinging) ringer.level(level, now); // your voice dips the alarm so "stop" is heard
  }
  showBargeDebug(level, performance.now());
  micPulse *= 0.92;
  // room mode: a voice from across the room still moves the orb
  viz.setMicLevel(muted ? 0 : Math.min(1, Math.max(level * roomGain(room), micPulse * 0.5)));
  requestAnimationFrame(meterLoop);
})();

// ---- controls -------------------------------------------------------------------
let running = false;

// A tiny silent WAV, played on the first tap so phones allow audio later.
function silentWav() {
  const samples = 800;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + samples * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}
// ---- power on, always listening, mute ------------------------------------------------
// One tap powers Jericho on; after that he listens for his name nonstop. Tapping the light
// later: reconnects a lost mic, unmutes, cuts him off while he talks, or stops what he's
// doing while he thinks or waits for a yes (what the Stop button used to do).
orb.addEventListener("click", () => {
  if (alarmRinging) return stopAlarm(); // tapping the light stops a ringing alarm
  if (!running) return powerOn();
  if (micLost) return reconnectMic();
  if (replyPlaying()) {
    if (muted) setMuted(false);
    return cutOff("tap"); // tapping while he talks: stop and listen
  }
  if (muted) return setMuted(false);
  if (mode === "thinking" || mode === "confirm") return stopEverything();
});
$("power-prompt")?.addEventListener("click", () => orb.click());

function powerOn() {
  running = true;
  // This tap unlocks audio playback on phones.
  audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  audioCtx.resume();
  for (const p of players) {
    p.src = silentWav();
    p.play().catch(() => {});
  }
  viz.powerOn?.(); // the power-up animation and sound
  if (!SR) {
    setMode("idle", "Speech recognition isn't supported here (try Chrome or Safari). You can type instead.");
    return;
  }
  setMode("idle", `Say “${config.assistantName}”…`);
  startListening();
  startMicMeter();
}


/** Where to rest when not listening: muted or waiting for the mic. */
function restingMode() {
  if (micLost) setMode("lost", "Mic lost. Tap to reconnect.");
  else setMode("muted", "Muted. Tap the light or press M to listen again.");
}

function setMuted(on) {
  if (on === muted || !running) return;
  muted = on;
  document.body.classList.toggle("muted", on);
  $("mute-btn")?.setAttribute("aria-pressed", String(on));
  if (on) {
    if (conversation) conversationFinished();
    conversation = false;
    stopConversationTimer();
    clearTimeout(settleTimer);
    clearTimeout(restartTimer);
    stopListening();
    stopMicMeter(); // nothing is listened to (the browser's mic light goes off)
    sleepTone();
    if (!replyPlaying()) confirmPending ? setMode("confirm", "Muted: tap Yes or No.") : restingMode();
  } else {
    if (!replyPlaying()) {
      if (confirmPending) setMode("confirm", "Say “yes” or “confirm” to go ahead.");
      else if (!micLost) setMode("idle", `Say “${config.assistantName}”…`);
      startListening();
    }
    startMicMeter();
    beep();
  }
  updateMicIndicator();
}
$("mute-btn")?.addEventListener("click", () => (running ? setMuted(!muted) : powerOn()));

function setMicLost(message = "Mic lost. Tap to reconnect.") {
  if (!running || micLost) return;
  micLost = true;
  clearTimeout(restartTimer);
  stopListening();
  stopMicMeter();
  if (conversation) conversationFinished();
  conversation = false;
  stopConversationTimer();
  if (!replyPlaying()) setMode("lost", message);
  else statusEl.textContent = message;
  updateMicIndicator();
}
function reconnectMic() {
  micLost = false;
  recFailures = 0;
  if (!muted) setMode("idle", `Say “${config.assistantName}”…`);
  startMicMeter();
  startListening();
}

// Watchdog: if recognition should be running but isn't (and no restart is on its way), start it.
setInterval(() => {
  if (!running || muted || micLost) return;
  if (wantListening && !recActive && performance.now() - lastStartAttempt > 4000) startListening();
  if (!isPhone && !micStream && !micStarting && audioCtx) startMicMeter();
  updateMicIndicator();
}, 3000);

/** The listening indicator: always shows whether the mic is live. */
function updateMicIndicator() {
  const el = $("mic-live");
  if (!el) return;
  let state;
  let text;
  if (!running) [state, text] = ["off", "Mic off"];
  else if (micLost) [state, text] = ["lost", "Mic lost · tap to reconnect"];
  else if (alarmRinging && recActive) [state, text] = ["live", "Mic live · say “stop” or “snooze”"];
  else if (muted) [state, text] = ["muted", "Muted · tap or press M"];
  else if (!SR) [state, text] = ["off", "No speech recognition here"];
  else if (replyPlaying()) [state, text] = ["paused", canListenForBargeIn() && bargeMode !== "off" ? "Mic paused · talk over me to interrupt" : "Mic paused while I speak"];
  else if (recActive) [state, text] = ["live", mode === "active" || mode === "confirm" ? "Mic live · listening" : `Mic live · say “${config.assistantName}”`];
  else [state, text] = ["wait", "Mic reconnecting…"];
  el.dataset.mic = state;
  const t = el.querySelector(".mic-text");
  if (t && t.textContent !== text) t.textContent = text;
}

// ---- far-field: wake sensitivity and room mode (settings panel) -------------------------------
const sensSelect = $("wake-sens");
if (sensSelect) {
  sensSelect.value = wakeSensitivity;
  sensSelect.addEventListener("change", () => {
    wakeSensitivity = sensSelect.value;
    store.set(SENS_KEY, wakeSensitivity);
  });
}
const roomBox = $("room-mode");
const roomNote = $("room-note");
function showRoom() {
  if (roomBox) roomBox.checked = Boolean(room.on);
  if (roomNote && !calibration) {
    roomNote.textContent = room.on
      ? Number.isFinite(room.voice)
        ? `Room mode on · calibrated (background ${room.noise.toFixed(3)}, your voice ${room.voice.toFixed(3)})`
        : "Room mode on · not calibrated yet (uses looser defaults)"
      : "Room mode off";
  }
}
function saveRoom() {
  store.set(ROOM_KEY, JSON.stringify(room));
  applyBargeSettings();
  showRoom();
}
roomBox?.addEventListener("change", () => {
  room = { ...room, on: roomBox.checked };
  saveRoom();
});
$("room-cal")?.addEventListener("click", () => {
  if (calibration) return;
  if (!running || muted || micLost || !micAnalyser) {
    if (roomNote) roomNote.textContent = isPhone ? "Calibrating needs a PC (phones don't give a mic level)." : "Power on and unmute first, then calibrate.";
    return;
  }
  calibration = { phase: "quiet", quiet: [], voice: [] };
  if (roomNote) roomNote.textContent = "Step 1 of 2: stay quiet for a moment…";
  setTimeout(() => {
    calibration.phase = "voice";
    if (roomNote) roomNote.textContent = `Step 2 of 2: from where you usually sit, say “${config.assistantName}” a few times…`;
    setTimeout(() => {
      const r = calibrateRoom(calibration.quiet, calibration.voice);
      calibration = null;
      if (r.ok) {
        room = { on: true, noise: r.noise, voice: r.voice };
        saveRoom();
      } else if (roomNote) roomNote.textContent = r.reason;
    }, 4000);
  }, 2500);
});
showRoom();

$("yes").addEventListener("click", () => mode === "confirm" && send("confirm", "yes"));
$("no").addEventListener("click", () => mode === "confirm" && send("confirm", "no"));
$("typed").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("typed-text");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  if (mode === "confirm") return send("confirm", text, { typed: true });
  if (mode === "active" || mode === "idle") conversation = running; // typing counts as talking
  send("ask", text, { typed: true });
});

// ---- announcements (e.g. "Claude Code finished") -------------------------------
// The browser reconnects this stream by itself after a drop. After every (re)connect we ask
// what's ringing, so an alarm that fired while the stream was down still rings. If the stream
// closes for good (e.g. the server was restarting), it's opened again after 10 s.
let events = null;
function connectEvents() {
  events = new EventSource(`/api/events?${new URLSearchParams({ token })}`);
  events.onopen = () => refreshAlarmList();
  events.onmessage = onEvent;
  events.onerror = () => {
    if (events.readyState === EventSource.CLOSED) setTimeout(connectEvents, 10_000);
  };
}
function onEvent(e) {
  let msg;
  try {
    msg = JSON.parse(e.data);
  } catch {
    return;
  }
  if (msg.type === "announce") {
    addLog("jericho", msg.text);
    if (running) speak(msg.text);
  } else if (msg.type === "alarm") startAlarm(msg.alarm);
  else if (msg.type === "alarm-stopped") {
    if (alarmRinging && (msg.ids || []).includes(alarmRinging.id)) endAlarmLocal(); // stopped elsewhere (another tab, the kill switch)
    refreshAlarmList();
  } else if (msg.type === "alarms-changed") refreshAlarmList();
}
connectEvents();

// ---- alarms: ringing, stop, snooze, and the list in the settings panel -------------------
// A ringing alarm beats everything: mute, a conversation, barge-in rules. Stop it with
// "Jericho, stop", Esc, tapping the light, or the big Stop button; snooze by voice or button.
const ringer = createAlarmRinger({ getCtx: () => audioCtx, ttsUrl, lang: () => config.speechLang });
const ALARM_VOL_KEY = "jericho-alarm-volume";
const SNOOZE_KEY = "jericho-snooze-minutes";
const alarmVolume = () => Math.min(1, Math.max(0.2, Number(store.get(ALARM_VOL_KEY) ?? DEFAULT_ALARM_VOLUME * 100) / 100));
const ALARM_SOUND_KEY = "jericho-alarm-sound";
const MAX_LOUD_KEY = "jericho-alarm-max-loud";
const alarmSound = () => normalizeSound(store.get(ALARM_SOUND_KEY) || DEFAULT_ALARM_SOUND);
const alarmMaxLoud = () => store.get(MAX_LOUD_KEY) === "1";
const alarmSoundSettings = () => ({ volume: alarmVolume(), sound: alarmSound(), maxLoud: alarmMaxLoud() });
const defaultSnooze = () => Math.min(60, Math.max(1, Number(store.get(SNOOZE_KEY)) || serverSnooze || 9));
let serverSnooze = 9;

/** Stop the reply being spoken (without the kill switch: tools keep going). */
function silenceReply() {
  if (!liveTurns.size) return;
  api("/api/interrupt", { sessionId }).catch(() => {});
  currentRequest?.abort();
  currentRequest = null;
  for (const t of liveTurns) {
    t.cancelled = true;
    t.queue.length = 0;
    t.finish();
  }
  for (const p of players) {
    p.pause();
    p.onended?.();
  }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  viz.setSpeechSource(null, false);
}

function startAlarm(alarm) {
  if (!alarm || alarmRinging?.id === alarm.id) return;
  alarmRinging = alarm;
  preview?.stop(); // a real alarm beats a preview
  silenceReply();
  document.body.classList.add("alarm-ringing");
  document.body.classList.remove("alarm-blocked");
  viz.setAlarm?.(true);
  $("alarm-label").textContent = alarm.label || "Alarm";
  $("alarm-time").textContent = alarm.time;
  $("alarm-panel").hidden = false;
  $("hud-alarm-label").textContent = alarm.label || "Alarm";
  $("hud-alarm-time").textContent = alarm.time;
  $("hud-alarm").hidden = false;
  addLog("note", `Alarm${alarm.label ? `: ${alarm.label}` : ""} (${alarm.time}). Say “stop” or “snooze”.`);
  // listen for "stop" and "snooze" even when muted (and before the first tap, if the browser allows)
  if (rec && !micLost) {
    wantListening = true;
    try { rec.start(); } catch { /* already running */ }
  }
  startMicMeter();
  ringer.start(alarm, alarmSoundSettings()).then(({ audible }) => {
    if (alarmRinging?.id !== alarm.id) return;
    if (audible) api("/api/alarm/ack", { id: alarm.id }).catch(() => {});
    else {
      // the browser won't play sound until you tap: the PC plays its own alarm sound instead
      document.body.classList.add("alarm-blocked");
      api("/api/alarm/blocked", { id: alarm.id }).catch(() => {});
    }
  });
}

/** Silence it here and put the page back the way it was. */
function endAlarmLocal() {
  ringer.stop();
  alarmRinging = null;
  document.body.classList.remove("alarm-ringing", "alarm-blocked");
  viz.setAlarm?.(false);
  $("alarm-panel").hidden = true;
  $("hud-alarm").hidden = true;
  if (muted || !running) {
    stopListening(); // back to muted / not powered on
    if (muted) stopMicMeter();
  }
}
function stopAlarm() {
  if (!alarmRinging) return false;
  const { id } = alarmRinging;
  endAlarmLocal();
  addLog("note", "Alarm stopped.");
  api("/api/alarm/stop", { id }).catch(() => {}); // also stops the PC's own alarm sound
  return true;
}
function snoozeAlarm(minutes) {
  if (!alarmRinging) return false;
  const { id } = alarmRinging;
  endAlarmLocal();
  const mins = minutes || defaultSnooze();
  api("/api/alarm/snooze", { id, minutes: mins })
    .then((r) => addLog("note", `Snoozed for ${mins} minutes, until ${r.time}.`))
    .catch(() => {});
  return true;
}
/** Words heard while it rings: "stop", "snooze (for N minutes)". */
function alarmHeard(text, isFinal) {
  const c = alarmCommand(text, { spoken: ringer.spoken() });
  if (!c) return false;
  if (c.action === "stop") return stopAlarm();
  // snooze waits for the final words, so "snooze for 15 minutes" isn't cut short
  if (c.action === "snooze" && isFinal) return snoozeAlarm(c.minutes);
  return false;
}
$("alarm-stop").addEventListener("click", (e) => {
  e.stopPropagation();
  stopAlarm();
});
$("alarm-snooze").addEventListener("click", (e) => {
  e.stopPropagation();
  snoozeAlarm();
});
// "Tap to dismiss": a tap anywhere on the alarm screen stops it
$("alarm-panel").addEventListener("click", () => stopAlarm());

// settings panel: volume, default snooze, upcoming alarms with Cancel buttons
const volIn = $("alarm-vol");
const snoozeIn = $("alarm-snooze-min");
if (volIn) {
  volIn.value = Math.round(alarmVolume() * 100);
  $("alarm-vol-val").textContent = `${volIn.value}%`;
  volIn.addEventListener("input", () => {
    store.set(ALARM_VOL_KEY, volIn.value);
    $("alarm-vol-val").textContent = `${volIn.value}%`;
  });
}
// the alarm sound, "Max loud", and a 3-second preview at the current settings
const soundSel = $("alarm-sound");
const maxLoudBox = $("alarm-max-loud");
if (soundSel) {
  soundSel.value = normalizeSound(alarmSound());
  soundSel.addEventListener("change", () => store.set(ALARM_SOUND_KEY, soundSel.value));
}
if (maxLoudBox) {
  maxLoudBox.checked = alarmMaxLoud();
  maxLoudBox.addEventListener("change", () => store.set(MAX_LOUD_KEY, maxLoudBox.checked ? "1" : "0"));
}
let preview = null;
$("alarm-preview")?.addEventListener("click", async () => {
  if (alarmRinging) return; // the real thing is already playing
  // this click lets the browser play sound, even before the first "power on" tap
  audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  await Promise.race([audioCtx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 300))]);
  preview?.stop();
  const stopBtn = $("alarm-preview-stop");
  preview = previewAlarm(audioCtx, alarmSoundSettings(), () => {
    if (stopBtn) stopBtn.hidden = true;
    preview = null;
  });
  if (stopBtn) stopBtn.hidden = false;
});
$("alarm-preview-stop")?.addEventListener("click", () => preview?.stop());

snoozeIn?.addEventListener("change", () => {
  const v = Math.min(60, Math.max(1, Math.round(Number(snoozeIn.value) || 9)));
  snoozeIn.value = v;
  store.set(SNOOZE_KEY, String(v));
});
async function refreshAlarmList() {
  try {
    const r = await api("/api/alarms");
    serverSnooze = r.snoozeMinutes || 9;
    if (snoozeIn) snoozeIn.value = defaultSnooze();
    if (r.ringing?.length && !alarmRinging) startAlarm(r.ringing[0]);
    const list = $("alarm-list");
    if (!list) return;
    list.textContent = "";
    if (!r.alarms.length) {
      const li = document.createElement("li");
      li.className = "hint";
      li.textContent = "No alarms set. Say “Jericho, set an alarm for 7 AM”.";
      list.append(li);
    }
    for (const a of r.alarms) {
      const li = document.createElement("li");
      const text = document.createElement("span");
      text.textContent = `${a.when}${a.repeat !== "once" ? ` · ${a.repeat}` : ""}${a.label ? ` · ${a.label}` : ""}${a.snoozed ? " · snoozed" : ""}`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "del";
      btn.textContent = "Cancel";
      btn.addEventListener("click", () => api("/api/alarm/cancel", { id: a.id }).then(refreshAlarmList).catch(() => {}));
      li.append(text, btn);
      list.append(li);
    }
  } catch {
    /* offline: try again later */
  }
}
refreshAlarmList();
setInterval(refreshAlarmList, 60_000);

setMode("off");
