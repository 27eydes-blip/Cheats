// Which voice Jericho speaks with: settings.json voice.provider = "browser" (free, the page's
// own Web Speech voice, no key), "openai" (gpt-4o-mini-tts, needs OPENAI_API_KEY) or
// "elevenlabs" (needs ELEVENLABS_API_KEY). A provider whose key is missing falls back to the
// browser voice, and a provider is never called unless it's the one selected.
// Phone calls: OpenAI if OPENAI_API_KEY is set, ElevenLabs if that's selected and set up,
// otherwise Twilio's own neural voice (no extra key).
import { loadSettings, secrets } from "./config.js";
import { logAction } from "./logger.js";

export const PROVIDERS = ["browser", "openai", "elevenlabs"];
export const CALM_INSTRUCTIONS =
  "Speak in a calm, reserved, low and steady voice. Unhurried, even pace, slightly slow, with natural short pauses between sentences. Polite and assertive. No excitement, no upward inflection, no filler.";

const num = (v, lo, hi, dflt) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? dflt : Math.min(hi, Math.max(lo, Number(v))));

/** The voice settings, read fresh each time (a page reload picks up a change). */
export function voiceSettings(s = loadSettings()) {
  const v = s.voice || {};
  return {
    provider: PROVIDERS.includes(v.provider) ? v.provider : "browser",
    browserVoice: String(v.browserVoice || "").slice(0, 120),
    browserRate: num(v.browserRate, 0.5, 1.5, 0.92),
    browserPitch: num(v.browserPitch, 0, 2, 0.85),
    openaiVoice: String(v.openaiVoice || "onyx").slice(0, 40),
    openaiModel: String(v.openaiModel || "gpt-4o-mini-tts").slice(0, 60),
    openaiInstructions: String(v.openaiInstructions || CALM_INSTRUCTIONS).slice(0, 1000),
  };
}

const hasKey = (provider, keys) => (provider === "openai" ? Boolean(keys.openai) : provider === "elevenlabs" ? Boolean(keys.elevenlabs) : true);
const currentKeys = () => ({ openai: secrets.openaiKey, elevenlabs: secrets.elevenLabsKey });

/** { provider, configured, reason? }: the one in use for the page. */
export function activeVoice(v = voiceSettings(), keys = currentKeys()) {
  if (hasKey(v.provider, keys)) return { provider: v.provider, configured: v.provider };
  const key = v.provider === "openai" ? "OPENAI_API_KEY" : "ELEVENLABS_API_KEY";
  return { provider: "browser", configured: v.provider, reason: `${key} isn't set in .env, so the browser voice is used` };
}

/** The voice on phone calls: "openai", "elevenlabs" or "twilio" (Twilio's own, no extra key). */
export function callVoiceProvider(v = voiceSettings(), keys = currentKeys()) {
  if (keys.openai) return "openai";
  if (v.provider === "elevenlabs" && keys.elevenlabs) return "elevenlabs";
  return "twilio";
}

export const COST = {
  browser: "free (your browser's own voice)",
  openai: "OpenAI gpt-4o-mini-tts, roughly 1.5 cents per minute of speech",
  elevenlabs: "ElevenLabs, uses your plan's characters",
  twilio: "Twilio's built-in voice, included in the call price",
};

/** For the page: what it should speak with. No keys, only names and numbers. */
export function publicVoice(v = voiceSettings(), keys = currentKeys()) {
  const a = activeVoice(v, keys);
  return {
    provider: a.provider,
    configured: a.configured,
    ...(a.reason ? { note: a.reason } : {}),
    cost: COST[a.provider],
    browserVoice: v.browserVoice,
    browserRate: v.browserRate,
    browserPitch: v.browserPitch,
    calls: callVoiceProvider(v, keys),
  };
}

// Characters spoken, per provider (counts only, never the text).
const usage = Object.fromEntries([...PROVIDERS, "twilio"].map((p) => [p, 0]));
/** Adds a turn's character counts ({ browser: 120 }) and logs them. */
export function countVoice(counts, where = "page") {
  const clean = {};
  for (const [p, n] of Object.entries(counts || {})) {
    const k = Number(n);
    if (Object.hasOwn(usage, p) && Number.isFinite(k) && k > 0 && k < 100_000) clean[p] = Math.round(k);
  }
  if (!Object.keys(clean).length) return null;
  for (const [p, n] of Object.entries(clean)) usage[p] += n;
  logAction("voice_usage", { where, chars: clean, totals: { ...usage } });
  return clean;
}
export const voiceUsage = () => ({ ...usage });
