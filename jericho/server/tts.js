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
    .update(JSON.stringify([norm, v.voiceId, v.modelId, v.outputFormat, v.voiceSettings]))
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

/** Streams speech for `text` into an HTTP response, from the cache when possible. */
export async function streamSpeech(text, res, { model } = {}) {
  const modelId = voiceModelFor(model);
  const v = voiceConfig(modelId ? { modelId } : {});
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
    upstream = await requestSpeech(text, v);
  } catch (err) {
    logAction("tts_error", { status: err.status, error: err.message, detail: err.detail, cause: err.status ? undefined : errorDetails(err) });
    res.writeHead(err.status ? 502 : 503, { "content-type": "text/plain" }).end(err.message);
    return;
  }
  res.writeHead(200, { "content-type": "audio/mpeg", "cache-control": "no-store", "x-tts-source": "elevenlabs" });
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

/** Whole audio file as a Buffer (used for phone calls, where Twilio fetches a file). */
export async function synthesize(text, overrides = {}) {
  const v = voiceConfig(overrides);
  const upstream = await requestSpeech(text, v);
  return Buffer.from(await upstream.arrayBuffer());
}

// Keep the ElevenLabs connection open while a page is connected (free endpoint, no credits).
addWarmer("elevenlabs", async () => {
  if (!secrets.elevenLabsKey) return;
  const r = await keepAliveFetch("https://api.elevenlabs.io/v1/models", { headers: { "xi-api-key": secrets.elevenLabsKey }, signal: AbortSignal.timeout(5000) });
  await r.arrayBuffer();
});
