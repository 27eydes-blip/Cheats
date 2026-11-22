// Jericho in the browser: ears (speech recognition + wake word), mouth (audio playback)
// and the gold visualizer. All thinking and all API keys live on the server.
import { createVisualizer } from "./visualizer.js";

const $ = (id) => document.getElementById(id);
const orb = $("orb");
const orbLabel = $("orb-label");
const statusEl = $("status");
const heardEl = $("heard");
const logEl = $("log");
const confirmBox = $("confirm");
const viz = createVisualizer($("viz"));

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
function setMode(m, status) {
  mode = m;
  orb.dataset.state = m;
  viz.setState(m);
  orbLabel.textContent = {
    off: "Start",
    idle: `Say ${config.assistantName}`,
    active: "Listening",
    thinking: "Thinking",
    speaking: "Speaking",
    confirm: "Yes / No?",
  }[m];
  orb.setAttribute("aria-label", m === "off" ? "Start listening" : "Pause listening");
  confirmBox.hidden = m !== "confirm";
  if (status !== undefined) statusEl.textContent = status;
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
const routed = new Set();
function routeThroughAnalyser(player) {
  if (routed.has(player)) return true;
  if (!audioCtx || audioCtx.state !== "running") return false; // a suspended graph would mute the voice
  try {
    if (!voiceAnalyser) {
      voiceAnalyser = audioCtx.createAnalyser();
      voiceAnalyser.fftSize = 256;
      voiceAnalyser.smoothingTimeConstant = 0.72;
      voiceAnalyser.connect(audioCtx.destination);
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
    u.onstart = () => { stats.firstAudio ??= performance.now(); };
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

async function elevenLabsVoice(text, stats, next) {
  if (audioCtx && audioCtx.state !== "running") await audioCtx.resume().catch(() => {});
  const player = assignPlayer(text, null);
  currentPlayer = player;
  if (next) preload(next); // the other player fetches the next sentence while this one speaks
  const isRouted = routeThroughAnalyser(player);
  viz.setSpeechSource(isRouted ? voiceAnalyser : null, !isRouted);
  return new Promise((resolve, reject) => {
    let started = false;
    const cleanup = () => {
      player.onended = player.onerror = player.onplaying = null;
      player.dataset.url = "";
      clearTimeout(stall);
    };
    // If audio hasn't started within 7s, give up and use the browser voice.
    const stall = setTimeout(() => { if (!started) { cleanup(); player.pause(); reject(new Error("TTS stalled")); } }, 7000);
    player.onplaying = () => { started = true; stats.firstAudio ??= performance.now(); };
    player.onended = () => { cleanup(); resolve(); };
    player.onerror = () => { cleanup(); reject(new Error("TTS failed")); };
    player.play().catch((e) => { cleanup(); reject(e); });
  });
}

/** One reply from Jericho: sentences are pushed in as they arrive and spoken in order. */
function createTurn() {
  let wake = null;
  const turn = {
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
  return turn;
}

async function playTurn(turn) {
  lastSpoken = "";
  for (;;) {
    if (turn.queue.length === 0) {
      if (turn.done) break;
      if (mode === "speaking") setMode("thinking", ""); // more of the reply is on its way
      await turn.next();
      continue;
    }
    const sentence = turn.queue.shift();
    if (mode !== "speaking") {
      stopConversationTimer();
      stopListening(); // the mic is off while Jericho talks, so it can't hear itself
      setMode("speaking", "");
    }
    turn.playing = true;
    lastSpoken = `${lastSpoken} ${normalize(sentence)}`;
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
  turn.stats.end = performance.now();
  viz.setSpeechSource(null, false);
  afterSpeaking();
}

/** Speak a whole piece of text (announcements, errors). */
function speak(text) {
  const turn = createTurn();
  turn.push(text);
  turn.finish();
  speechQueue = speechQueue.then(() => playTurn(turn));
  return speechQueue;
}

function afterSpeaking() {
  if (confirmPending) setMode("confirm", "Say “yes” or “confirm” to go ahead.");
  else if (endAfterReply) endConversation();
  else if (conversation && running) {
    setMode("active", "Listening… (no need to say my name)");
    restartConversationTimer(); // Jericho finished talking: timer starts again
  } else if (running) setMode("idle", `Say “${config.assistantName}”…`);
  else setMode("off", "Tap start to talk to me.");
  endAfterReply = false;
  // Short pause before the mic comes back, so the tail of the audio isn't picked up.
  if (running) setTimeout(() => mode !== "speaking" && startListening(), 350);
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
  if (running) {
    sleepTone();
    setMode("idle", `Say “${config.assistantName}”…`);
  } else setMode("off", "Tap start to talk to me.");
}

// ---- brain round trips ----------------------------------------------------------
let confirmTimer;
let confirmPending = false;
let lastUtterance = null; // timing of the last thing you said (see the ears section)

async function send(kind, text, { endAfter = false } = {}) {
  addLog("you", text);
  stopConversationTimer();
  setMode("thinking", "Thinking…");
  const turn = createTurn();
  const spoken = lastUtterance && performance.now() - lastUtterance.final < 2000 ? lastUtterance : null;
  lastUtterance = null;
  Object.assign(turn.stats, { final: spoken?.final ?? performance.now(), first: spoken?.first, last: spoken?.last });
  const playing = (speechQueue = speechQueue.then(() => playTurn(turn)));

  let result = { awaitingConfirmation: false };
  let bubble = null;
  try {
    const res = await fetch(kind === "confirm" ? "/api/confirm" : "/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jericho-token": token },
      body: JSON.stringify({ sessionId, text }),
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
        } else if (msg.type === "done") {
          result = msg;
        }
      }
    }
  } catch (e) {
    addLog("note", e.message);
    turn.push("Sorry, I couldn't reach the server.");
  }

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

function wakeRegex(flags = "i") {
  return new RegExp(`\\b(?:hey\\s+|ok\\s+|okay\\s+)?(?:${escapeWords(config.wakeWords)})\\b[\\s,.!?]*`, flags);
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

function onHeard(raw) {
  clearTimeout(settleTimer);
  if (preThinkingFrom) {
    mode = preThinkingFrom; // carry on as if the animation hadn't switched yet
    preThinkingFrom = null;
  }
  lastUtterance = { first: heardTimes.first, last: heardTimes.last ?? performance.now(), final: performance.now() };
  heardTimes = { first: null, last: null };
  const text = raw.trim();
  if (!text || isEcho(text)) return;

  // Safety confirmations work exactly as before: whatever you say goes to the
  // server, which only accepts a clear yes. "That's all" here is a no, then sleep.
  if (mode === "confirm") {
    const ending = splitEndPhrase(text) !== null;
    return send("confirm", text, { endAfter: ending });
  }

  if (mode === "active") {
    restartConversationTimer(); // you spoke: timer starts again
    const rest = splitEndPhrase(text);
    if (rest !== null) {
      // "Thanks Jericho" ends it now. "Lights off, that's all" does the request first.
      return rest.length > 2 ? send("ask", rest, { endAfter: true }) : endConversation();
    }
    const request = text.replace(wakeRegex(), " ").trim();
    if (request.length > 1) return send("ask", request);
    beep(); // just the wake word again: still listening
    return;
  }

  if (mode !== "idle") return; // thinking or speaking: ignore
  if (splitEndPhrase(text) !== null) return; // "thanks Jericho" while asleep: stay asleep
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
  if (!rec) return;
  wantListening = true;
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
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) onHeard(r[0].transcript);
      else interim += r[0].transcript;
    }
    heardEl.textContent = interim;
    if (interim) onInterim(interim);
    if (interim && mode === "active") restartConversationTimer();
    micPulse = Math.min(1, micPulse + 0.18); // works even where we can't meter the mic
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      wantListening = false;
      setMode("off", "Microphone blocked. Allow mic access (and use HTTPS on the phone).");
    }
  };
  // Browsers stop listening every so often; quietly restart.
  rec.onend = () => { if (wantListening) setTimeout(() => wantListening && startListening(), 250); };
}

// ---- mic volume for the visualizer -----------------------------------------------
// Desktop: a real level meter on the mic. Phones: speech recognition and a second mic
// stream can fight over the microphone, so there the bars react to recognition activity.
const isPhone = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
let micStream = null;
let micAnalyser = null;
let micPulse = 0;
let micBuf = null;

async function startMicMeter() {
  if (isPhone || micStream || !navigator.mediaDevices?.getUserMedia || !audioCtx) return;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    if (!running) return stopMicMeter();
    micAnalyser = audioCtx.createAnalyser();
    micAnalyser.fftSize = 512;
    audioCtx.createMediaStreamSource(micStream).connect(micAnalyser); // analysed only, never played
    micBuf = new Float32Array(micAnalyser.fftSize);
  } catch {
    micStream = null;
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
  }
  micPulse *= 0.92;
  viz.setMicLevel(Math.min(1, Math.max(level, micPulse * 0.5)));
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
orb.addEventListener("click", () => {
  if (running) {
    running = false;
    if (conversation) conversationFinished();
    conversation = false;
    stopMicMeter();
    stopConversationTimer();
    stopListening();
    speechSynthesis?.cancel();
    for (const p of players) p.pause();
    setMode("off", "Paused. Tap to start again.");
    return;
  }
  running = true;
  // This tap unlocks audio playback on phones.
  audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  audioCtx.resume();
  for (const p of players) {
    p.src = silentWav();
    p.play().catch(() => {});
  }
  if (!SR) {
    setMode("idle", "Speech recognition isn't supported here (try Chrome or Safari). You can type instead.");
    return;
  }
  setMode("idle", `Say “${config.assistantName}”…`);
  startListening();
  startMicMeter();
});

$("yes").addEventListener("click", () => mode === "confirm" && send("confirm", "yes"));
$("no").addEventListener("click", () => mode === "confirm" && send("confirm", "no"));
$("typed").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("typed-text");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  if (mode === "confirm") return send("confirm", text);
  if (mode === "active" || mode === "idle") conversation = running; // typing counts as talking
  send("ask", text);
});

// ---- announcements (e.g. "Claude Code finished") -------------------------------
const events = new EventSource(`/api/events?${new URLSearchParams({ token })}`);
events.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "announce") {
    addLog("jericho", msg.text);
    if (running) speak(msg.text);
  }
};

setMode("off");
