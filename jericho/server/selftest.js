// Startup self-test: one tiny request to Claude and one to ElevenLabs, with a clear
// PASS or FAIL and the real reason. Runs when the server starts, or on its own with:
//   npm run selftest
import Anthropic from "@anthropic-ai/sdk";
import { pathToFileURL } from "node:url";
import { loadSettings, secrets } from "./config.js";
import { logAction } from "./logger.js";
import { connectionMode, errorDetails, errorSummary, keepAliveFetch } from "./net.js";

function claudeReason(err) {
  if (err instanceof Anthropic.AuthenticationError) return "the API key was rejected (401). Check ANTHROPIC_API_KEY in .env";
  if (err instanceof Anthropic.PermissionDeniedError) return "the API key isn't allowed to do this (403)";
  if (err instanceof Anthropic.RateLimitError) return "rate limited (429), try again in a minute";
  if (err instanceof Anthropic.APIConnectionError) return `couldn't connect: ${errorSummary(err.cause || err)}`;
  if (err instanceof Anthropic.APIError) return `HTTP ${err.status}: ${err.message}`;
  return errorSummary(err);
}

async function testClaude(client) {
  if (!secrets.anthropicKey && !process.env.ANTHROPIC_AUTH_TOKEN) return { status: "FAIL", reason: "ANTHROPIC_API_KEY isn't set in .env" };
  const t0 = Date.now();
  try {
    await client.models.list({ limit: 1 }); // free: checks the key and the connection
    return { status: "PASS", reason: `${Date.now() - t0} ms` };
  } catch (err) {
    return { status: "FAIL", reason: claudeReason(err), cause: errorDetails(err) };
  }
}

async function testElevenLabs() {
  if (!secrets.elevenLabsKey) return { status: "SKIP", reason: "no ELEVENLABS_API_KEY in .env, so the browser voice will be used" };
  const el = loadSettings().elevenlabs || {};
  const t0 = Date.now();
  try {
    // Three characters of speech: checks the key, the voice ID and the connection together.
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(el.voiceId)}?output_format=mp3_22050_32`;
    const res = await keepAliveFetch(url, {
      method: "POST",
      headers: { "xi-api-key": secrets.elevenLabsKey, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: "Hi.", model_id: el.modelId || "eleven_flash_v2_5" }),
    });
    const body = Buffer.from(await res.arrayBuffer());
    if (res.ok) return { status: "PASS", reason: `${Date.now() - t0} ms, voice ${el.voiceId}` };
    let detail = body.toString("utf8").slice(0, 300);
    try {
      const j = JSON.parse(detail);
      detail = j.detail?.message || j.detail?.status || JSON.stringify(j.detail || j);
    } catch {
      /* not JSON */
    }
    const hint =
      res.status === 401 ? " Check ELEVENLABS_API_KEY in .env, and that the key has text-to-speech access."
        : res.status === 404 || /voice/i.test(detail) ? ` Check elevenlabs.voiceId (${el.voiceId}) in settings.json.`
        : "";
    return { status: "FAIL", reason: `HTTP ${res.status}: ${detail}.${hint}` };
  } catch (err) {
    return { status: "FAIL", reason: `couldn't connect: ${errorSummary(err)}`, cause: errorDetails(err) };
  }
}

/** Runs both checks and prints the result. Returns true if nothing failed. */
export async function selfTest(client = new Anthropic({ fetch: (url, init) => keepAliveFetch(url, init) })) {
  const [claude, eleven] = await Promise.all([testClaude(client), testElevenLabs()]);
  const mark = { PASS: "✅ PASS", FAIL: "❌ FAIL", SKIP: "➖ SKIP" };
  console.log(`   Self-test (Node ${process.version}, connections: ${connectionMode()}):`);
  console.log(`     Claude      ${mark[claude.status]}  ${claude.reason}`);
  console.log(`     ElevenLabs  ${mark[eleven.status]}  ${eleven.reason}`);
  logAction("selftest", { node: process.version, connections: connectionMode(), claude, elevenlabs: eleven });
  return claude.status !== "FAIL" && eleven.status !== "FAIL";
}

// `npm run selftest`
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const ok = await selfTest();
  process.exit(ok ? 0 : 1);
}
