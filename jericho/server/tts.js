// ElevenLabs text-to-speech, called from the server so the API key never reaches
// the browser. Audio is streamed straight through as it is generated.
import { Readable } from "node:stream";
import { loadSettings, secrets } from "./config.js";
import { logAction } from "./logger.js";

const MAX_CHARS = 1000;

export async function streamSpeech(text, res) {
  if (!secrets.elevenLabsKey) {
    res.writeHead(503, { "content-type": "text/plain" }).end("ElevenLabs key not set");
    return;
  }
  // Re-read settings each time so you can swap voices without restarting.
  const el = loadSettings().elevenlabs || {};
  const url = new URL(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(el.voiceId)}/stream`,
  );
  url.searchParams.set("output_format", el.outputFormat || "mp3_44100_128");

  let upstream;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": secrets.elevenLabsKey, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({
        text: String(text).slice(0, MAX_CHARS),
        model_id: el.modelId || "eleven_flash_v2_5",
        voice_settings: { stability: el.stability ?? 0.5, similarity_boost: el.similarityBoost ?? 0.75 },
      }),
    });
  } catch (err) {
    logAction("tts_error", { error: err.message });
    res.writeHead(502, { "content-type": "text/plain" }).end("ElevenLabs unreachable");
    return;
  }
  if (!upstream.ok || !upstream.body) {
    const detail = (await upstream.text().catch(() => "")).slice(0, 300);
    logAction("tts_error", { status: upstream.status, detail });
    res.writeHead(502, { "content-type": "text/plain" }).end(`ElevenLabs error ${upstream.status}`);
    return;
  }
  res.writeHead(200, { "content-type": "audio/mpeg", "cache-control": "no-store" });
  const body = Readable.fromWeb(upstream.body);
  body.on("error", () => res.destroy());
  res.on("close", () => body.destroy());
  body.pipe(res);
}
