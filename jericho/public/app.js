// Jericho in the browser: ears (speech recognition + wake word) and mouth (audio playback).
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
  orbLabel.textContent = {
    off: "Start",
    idle: `Say ${config.assistantName}`,
    active: "Listening",
    thinking: "…",
    speaking: "Speaking",
    confirm: "Yes / No?",
  }[m];
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
const audio = new Audio();
audio.preload = "auto";
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
    lastSpoken = normalize(text);
    stopConversationTimer();
    stopListening(); // the mic is off while Jericho talks, so it can't hear itself
    setMode("speaking");
    try {
      if (!config.elevenLabsEnabled) throw new Error("no key");
      await elevenLabsVoice(text);
    } catch {
      await browserVoice(text);
    }
    afterSpeaking();
  });
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
function endConversation() {
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
async function send(kind, text, { endAfter = false } = {}) {
  addLog("you", text);
  stopConversationTimer();
  setMode("thinking", "Thinking…");
  try {
    const r = await api(kind === "confirm" ? "/api/confirm" : "/api/ask", { sessionId, text });
    addLog("jericho", r.reply);
    clearTimeout(confirmTimer);
    confirmPending = Boolean(r.awaitingConfirmation);
    endAfterReply = endAfter && !confirmPending; // never skip past a pending yes/no
    if (confirmPending) {
      confirmTimer = setTimeout(() => {
        if (mode === "confirm") {
          confirmPending = false;
          conversation = false;
          setMode("idle", "Confirmation timed out.");
        }
      }, 60_000);
    }
    await speak(r.reply);
  } catch (e) {
    addLog("note", e.message);
    confirmPending = false;
    await speak("Sorry, I couldn't reach the server.");
  }
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

function onHeard(raw) {
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
    if (interim && mode === "active") restartConversationTimer();
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
    conversation = false;
    stopConversationTimer();
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
