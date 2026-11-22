// Jarvis in the browser: ears (speech recognition + wake word) and mouth (audio playback).
// All thinking and all API keys live on the server.

const $ = (id) => document.getElementById(id);
const orb = $("orb");
const orbLabel = $("orb-label");
const statusEl = $("status");
const heardEl = $("heard");
const logEl = $("log");
const confirmBox = $("confirm");

// ---- identity & access token -------------------------------------------------
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const params = new URLSearchParams(location.search);
if (params.has("token")) {
  store.set("jarvis-token", params.get("token"));
  history.replaceState(null, "", location.pathname); // keep the token out of the address bar
}
const token = store.get("jarvis-token") || "";
let sessionId = store.get("jarvis-session");
if (!sessionId) {
  sessionId = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
  store.set("jarvis-session", sessionId);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-jarvis-token": token },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new Error("Access token missing or wrong. Open the page with ?token=…");
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res.json();
}

// ---- UI helpers ---------------------------------------------------------------
let mode = "off"; // off | idle | command | thinking | speaking | confirm
function setMode(m, status) {
  mode = m;
  orb.dataset.state = m;
  orbLabel.textContent = { off: "Start", idle: "Listening", command: "Go ahead", thinking: "…", speaking: "Speaking", confirm: "Yes / No?" }[m];
  confirmBox.hidden = m !== "confirm";
  if (status) statusEl.textContent = status;
}
function addLog(who, text) {
  const li = document.createElement("li");
  li.className = who;
  li.textContent = text;
  logEl.prepend(li);
  while (logEl.children.length > 30) logEl.lastChild.remove();
}

// ---- config ---------------------------------------------------------------------
let config = { assistantName: "Jarvis", wakeWords: ["jarvis"], speechLang: "en-US", elevenLabsEnabled: false };
api("/api/config")
  .then((c) => {
    config = c;
    $("name").textContent = c.assistantName;
    document.title = c.assistantName;
  })
  .catch((e) => (statusEl.textContent = e.message));

// ---- voice out ---------------------------------------------------------------------
const audio = new Audio();
audio.preload = "auto";
let audioCtx;
let speechQueue = Promise.resolve();

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

function browserVoice(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = config.speechLang;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

function elevenLabsVoice(text) {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ text, token });
    let started = false;
    const cleanup = () => { audio.onended = audio.onerror = audio.onplaying = null; clearTimeout(stall); };
    // If audio hasn't started within 7s, give up and use the browser voice.
    const stall = setTimeout(() => { if (!started) { cleanup(); audio.pause(); reject(new Error("TTS stalled")); } }, 7000);
    audio.onplaying = () => { started = true; };
    audio.onended = () => { cleanup(); resolve(); };
    audio.onerror = () => { cleanup(); reject(new Error("TTS failed")); };
    // The server streams MP3 as ElevenLabs generates it, so playback starts early.
    audio.src = `/api/tts?${q}`;
    audio.play().catch((e) => { cleanup(); reject(e); });
  });
}

function speak(text) {
  speechQueue = speechQueue.then(async () => {
    const after = mode === "confirm" ? "confirm" : "idle";
    stopListening(); // don't let Jarvis hear itself
    setMode("speaking");
    try {
      if (!config.elevenLabsEnabled) throw new Error("no key");
      await elevenLabsVoice(text);
    } catch {
      await browserVoice(text);
    }
    if (after === "confirm") setMode("confirm", "Say “yes” or “confirm” to go ahead.");
    else if (running) setMode("idle", `Say “${config.assistantName}”…`);
    else setMode("off", "Tap start to talk to me.");
    if (running) startListening();
  });
  return speechQueue;
}

// ---- brain round trips ----------------------------------------------------------
let confirmTimer;
async function send(kind, text) {
  addLog("you", text);
  setMode("thinking", "Thinking…");
  try {
    const r = await api(kind === "confirm" ? "/api/confirm" : "/api/ask", { sessionId, text });
    addLog("jarvis", r.reply);
    clearTimeout(confirmTimer);
    if (r.awaitingConfirmation) {
      mode = "confirm"; // speak() returns to confirm mode afterwards
      confirmTimer = setTimeout(() => { if (mode === "confirm") setMode("idle", "Confirmation timed out."); }, 60_000);
    }
    await speak(r.reply);
  } catch (e) {
    addLog("note", e.message);
    await speak("Sorry, I couldn't reach the server.");
  }
}

// ---- ears --------------------------------------------------------------------------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec;
let wantListening = false;
let commandTimer;

function wakeRegex() {
  const words = config.wakeWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return new RegExp(`\\b(?:hey\\s+|ok\\s+|okay\\s+)?(?:${words})\\b[\\s,.!?]*`, "i");
}

function onHeard(raw) {
  const text = raw.trim();
  if (!text) return;
  if (mode === "confirm") return send("confirm", text);
  if (mode === "command") {
    clearTimeout(commandTimer);
    return send("ask", text.replace(wakeRegex(), "").trim() || text);
  }
  if (mode !== "idle") return;
  const m = wakeRegex().exec(text);
  if (!m) return; // not for us
  const rest = text.slice(m.index + m[0].length).trim();
  if (rest.length > 1) return send("ask", rest); // "Jarvis, turn on the lights"
  // Just "Jarvis": wait for the request.
  beep();
  setMode("command", "Yes?");
  commandTimer = setTimeout(() => { if (mode === "command") setMode("idle", `Say “${config.assistantName}”…`); }, 8000);
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
    stopListening();
    speechSynthesis?.cancel();
    audio.pause();
    setMode("off", "Paused. Tap to start again.");
    return;
  }
  running = true;
  // This tap unlocks audio playback on phones.
  audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  audioCtx.resume();
  audio.src = silentWav();
  audio.play().catch(() => {});
  if (!SR) {
    setMode("idle", "Speech recognition isn't supported here (try Chrome or Safari). You can type instead.");
    return;
  }
  setMode("idle", `Say “${config.assistantName}”…`);
  startListening();
});

$("yes").addEventListener("click", () => mode === "confirm" && send("confirm", "yes"));
$("no").addEventListener("click", () => mode === "confirm" && send("confirm", "no"));
$("typed").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("typed-text");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  send(mode === "confirm" ? "confirm" : "ask", text);
});

// ---- announcements (e.g. "Claude Code finished") -------------------------------
const events = new EventSource(`/api/events?${new URLSearchParams({ token })}`);
events.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "announce") {
    addLog("jarvis", msg.text);
    if (running) speak(msg.text);
  }
};

setMode("off");
