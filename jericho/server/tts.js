// ElevenLabs text-to-speech, called from the server so the API key never reaches the
// browser. Audio streams straight through as it's generated. Short phrases that come
// up more than once are saved to data/audio-cache and served from disk next time.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { loadSettings, ROOT, secrets } from "./config.js";
import { logAction } from "./logger.js";
import { addWarmer, errorDetails, keepAliveFetch } from "./net.js";
import { activeVoice, callVoiceProvider, CALM_INSTRUCTIONS, voiceSettings } from "./voice.js";

const MAX_CHARS = 1000;
const CACHE_DIR = path.join(process.env.JERICHO_DATA_DIR || path.join(ROOT, "data"), "audio-cache");
const seen = new Map(); // phrase key -> times requested this run

// Voice models, fastest first. "flash" has the lowest latency and still sounds natural.
export const VOICE_MODELS = { flash: "eleven_flash_v2_5", turbo: "eleven_turbo_v2_5", multilingual: "eleven_multilingual_v2" };
/** The ElevenLabs model id for a choice from the page ("flash", ...); anything else: settings.json. */
export function voiceModelFor(choice) {
  return Object.hasOwn(VOICE_MODELS, choice) ? VOICE_MODELS[choice] : undefined;
}
// The page's quick acknowledgments ("On it.") are saved to disk the first time, so they play instantly.
export const ACK_PHRASES = ["On it.", "One sec.", "Okay, one moment."];
const ackKeys = new Set(ACK_PHRASES.map((p) => p.trim().toLowerCase()));

function voiceConfig(overrides = {}) {
  // Re-read settings each time so you can swap voices without restarting.
  const el = { ...(loadSettings().elevenlabs || {}), ...overrides };
  return {
    voiceId: el.voiceId,
    modelId: el.modelId || "eleven_flash_v2_5",
    outputFormat: el.outputFormat || "mp3_44100_128",
    voiceSettings: {
      stability: el.stability ?? 0.5,
      similarity_boost: el.similarityBoost ?? 0.75,
      style: el.style ?? 0,
      use_speaker_boost: el.useSpeakerBoost ?? true,
      speed: el.speed ?? 1.0,
    },
  };
}

function cacheSettings() {
  const c = loadSettings().audioCache || {};
  return { enabled: c.enabled !== false, maxWords: c.maxWords ?? 8, maxFiles: c.maxFiles ?? 300, minRepeats: c.minRepeats ?? 2 };
}

function cacheKey(text, v) {
  const norm = String(text).trim().toLowerCase().replace(/\s+/g, " ");
  return crypto
    .createHash("sha256")
    // OpenAI clips are keyed by their own voice and style, so the two never mix
    .update(JSON.stringify(v.provider === "openai" ? [norm, "openai", v.model, v.voice, v.instructions] : [norm, v.voiceId, v.modelId, v.outputFormat, v.voiceSettings]))
    .digest("hex")
    .slice(0, 32);
}

function pruneCache(maxFiles) {
  try {
    const files = fs
      .readdirSync(CACHE_DIR)
      .filter((f) => f.endsWith(".mp3"))
      .map((f) => ({ f, t: fs.statSync(path.join(CACHE_DIR, f)).atimeMs }))
      .sort((a, b) => a.t - b.t);
    for (const { f } of files.slice(0, Math.max(0, files.length - maxFiles))) fs.unlinkSync(path.join(CACHE_DIR, f));
  } catch {
    /* nothing to prune */
  }
}

/** OpenAI's speech API (gpt-4o-mini-tts): returns the streaming Response (or throws). Audio arrives as it's made. */
async function requestOpenAiSpeech(text, o) {
  if (!secrets.openaiKey) throw new Error("OpenAI key not set");
  const upstream = await keepAliveFetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { authorization: `Bearer ${secrets.openaiKey}`, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ model: o.model, voice: o.voice, input: String(text).slice(0, MAX_CHARS), instructions: o.instructions, response_format: "mp3" }),
  });
  if (!upstream.ok || !upstream.body) {
    const detail = (await upstream.text().catch(() => "")).slice(0, 300);
    const err = new Error(`OpenAI speech error ${upstream.status}`);
    err.detail = detail;
    err.status = upstream.status;
    throw err;
  }
  return upstream;
}

function openAiConfig(overrides = {}) {
  const v = voiceSettings();
  return { model: v.openaiModel, voice: overrides.voice || v.openaiVoice, instructions: overrides.instructions || v.openaiInstructions };
}

/** Calls ElevenLabs and returns the streaming Response (or throws). */
async function requestSpeech(text, v) {
  if (!secrets.elevenLabsKey) throw new Error("ElevenLabs key not set");
  const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(v.voiceId)}/stream`);
  url.searchParams.set("output_format", v.outputFormat);
  const upstream = await keepAliveFetch(url, {
    method: "POST",
    headers: { "xi-api-key": secrets.elevenLabsKey, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text: String(text).slice(0, MAX_CHARS), model_id: v.modelId, voice_settings: v.voiceSettings }),
  });
  if (!upstream.ok || !upstream.body) {
    const detail = (await upstream.text().catch(() => "")).slice(0, 300);
    const err = new Error(`ElevenLabs error ${upstream.status}`);
    err.detail = detail;
    err.status = upstream.status;
    throw err;
  }
  return upstream;
}

/**
 * Streams speech for `text` into an HTTP response, from the cache when possible. Uses the voice
 * provider from settings.json (OpenAI or ElevenLabs); with the browser voice there's nothing to
 * fetch here, and neither service is ever called unless it's the one selected.
 */
export async function streamSpeech(text, res, { model, provider = activeVoice().provider } = {}) {
  if (provider !== "openai" && provider !== "elevenlabs") {
    res.writeHead(409, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ error: "The browser voice is selected: speech is made in the page.", provider: "browser" }));
    return;
  }
  const modelId = voiceModelFor(model);
  const v = provider === "openai" ? { provider, ...openAiConfig() } : voiceConfig(modelId ? { modelId } : {});
  const cache = cacheSettings();
  const words = String(text).trim().split(/\s+/).length;
  const cacheable = cache.enabled && words <= cache.maxWords;
  const key = cacheKey(text, v);
  const file = path.join(CACHE_DIR, `${key}.mp3`);

  if (cacheable && fs.existsSync(file)) {
    // the same words in the same voice never change: the browser may keep them too
    res.writeHead(200, { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400", "x-tts-source": "cache" });
    fs.createReadStream(file).pipe(res);
    const now = new Date();
    fs.utimes(file, now, now, () => {});
    return;
  }

  let upstream;
  try {
    upstream = provider === "openai" ? await requestOpenAiSpeech(text, v) : await requestSpeech(text, v);
  } catch (err) {
    logAction("tts_error", { provider, status: err.status, error: err.message, detail: err.detail, cause: err.status ? undefined : errorDetails(err) });
    // the page drops to the browser voice and keeps talking
    res.writeHead(err.status ? 502 : 503, { "content-type": "text/plain" }).end(err.message);
    return;
  }
  res.writeHead(200, { "content-type": "audio/mpeg", "cache-control": "no-store", "x-tts-source": provider });
  const body = Readable.fromWeb(upstream.body);
  const count = (seen.get(key) || 0) + 1;
  seen.delete(key); // re-insert so the Map stays in least-recently-used order
  seen.set(key, count);
  // Jericho runs for weeks: forget the oldest short phrases so this can't grow forever
  if (seen.size > 2000) for (const old of [...seen.keys()].slice(0, 500)) seen.delete(old);
  const isAck = ackKeys.has(String(text).trim().toLowerCase());
  const keep = cacheable && (count >= cache.minRepeats || isAck); // short and repeated: save a copy
  const chunks = [];
  body.on("data", (c) => {
    if (keep) chunks.push(c);
  });
  body.on("end", () => {
    if (!keep || chunks.length === 0) return;
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(file, Buffer.concat(chunks));
      pruneCache(cache.maxFiles);
    } catch {
      /* cache is best effort */
    }
  });
  body.on("error", () => res.destroy());
  res.on("close", () => body.destroy());
  body.pipe(res);
}

/** Whole audio file as a Buffer, from ElevenLabs (used for phone calls, where Twilio fetches a file). */
export async function synthesize(text, overrides = {}) {
  const v = voiceConfig(overrides);
  const upstream = await requestSpeech(text, v);
  return Buffer.from(await upstream.arrayBuffer());
}

/** Whole audio file from OpenAI (phone calls): the calm, reserved call style. */
export async function synthesizeOpenAi(text, { instructions = CALM_INSTRUCTIONS, voice } = {}) {
  const upstream = await requestOpenAiSpeech(text, openAiConfig({ instructions, voice }));
  return Buffer.from(await upstream.arrayBuffer());
}

// Keep the connection to the selected voice service open while a page is connected (free
// endpoints, no credits). A service that isn't selected is never touched.
addWarmer("openai", async () => {
  if (!secrets.openaiKey || (activeVoice().provider !== "openai" && callVoiceProvider() !== "openai")) return;
  const r = await keepAliveFetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${secrets.openaiKey}` }, signal: AbortSignal.timeout(5000) });
  await r.arrayBuffer();
});
addWarmer("elevenlabs", async () => {
  if (!secrets.elevenLabsKey || (activeVoice().provider !== "elevenlabs" && callVoiceProvider() !== "elevenlabs")) return;
  const r = await keepAliveFetch("https://api.elevenlabs.io/v1/models", { headers: { "xi-api-key": secrets.elevenLabsKey }, signal: AbortSignal.timeout(5000) });
  await r.arrayBuffer();
});
