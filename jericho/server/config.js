// Loads settings.json (non-secret, safe to edit) and .env (secrets).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load .env without a dependency (Node >= 20.12). Real env vars win.
// JERICHO_NO_ENV_FILE=1 (tests only): ignore .env completely, so a test server never picks up your real keys.
const NO_ENV_FILE = process.env.JERICHO_NO_ENV_FILE === "1";
try {
  if (!NO_ENV_FILE) process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  /* no .env file: rely on the real environment */
}

/** Problems found with the .env file, shown by the startup self-test (never the values). */
export const envNotes = [];

/**
 * Read a .env file the way Windows editors save it too: with a UTF-8 byte order mark, as
 * "Unicode" (UTF-16), or named ".env.txt" by Notepad. Fills in only what's still missing,
 * so this never overrides a real environment variable or what loadEnvFile already read.
 */
export function decodeEnvFile(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return { text: buf.subarray(2).toString("utf16le"), note: "saved as Unicode (UTF-16)" };
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return { text: Buffer.from(buf.subarray(2)).swap16().toString("utf16le"), note: "saved as Unicode (UTF-16 big endian)" };
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { text: buf.subarray(3).toString("utf8"), note: "" };
  if (buf.length > 3 && buf[1] === 0 && buf[3] === 0) return { text: buf.toString("utf16le"), note: "saved as Unicode (UTF-16)" };
  return { text: buf.toString("utf8"), note: "" };
}
export function parseEnvText(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    const q = /^(["'`])([\s\S]*)\1$/.exec(v);
    if (q) v = q[2];
    else v = v.replace(/\s+#.*$/, "").trim(); // trailing comment (unquoted values only)
    out[m[1]] = v;
  }
  return out;
}
function fillFromEnvFile() {
  if (NO_ENV_FILE) return;
  const main = path.join(ROOT, ".env");
  const candidates = [main, path.join(ROOT, ".env.txt"), path.join(ROOT, ".env.env")];
  for (const file of candidates) {
    let buf;
    try {
      buf = fs.readFileSync(file);
    } catch {
      continue;
    }
    if (file !== main) {
      if (fs.existsSync(main)) continue;
      envNotes.push(`your settings file is named "${path.basename(file)}". Rename it to ".env" (Windows hides the .txt ending)`);
    }
    const { text, note } = decodeEnvFile(buf);
    if (note) envNotes.push(`.env is ${note}. It still works, but save it as UTF-8 to be safe`);
    for (const [k, v] of Object.entries(parseEnvText(text))) if (!process.env[k] && v !== "") process.env[k] = v;
  }
}
if (process.env.JERICHO_NO_ENV_FALLBACK !== "1") fillFromEnvFile();

export function expandHome(p) {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

export function loadSettings() {
  const file = process.env.JERICHO_SETTINGS || path.join(ROOT, "settings.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export const settings = loadSettings();

/**
 * A calendar link as people paste it: stray spaces or line breaks, quotes around it (plain or
 * curly), <angle brackets>, the variable name pasted twice, or a webcal:// link.
 */
export function cleanCalendarLink(raw) {
  let v = String(raw ?? "").trim();
  for (let i = 0; i < 3; i++) {
    v = v.replace(/^CALENDAR_ICS_URL\s*=\s*/i, "").trim();
    const q = /^(["'`“”‘’<])([\s\S]*?)(["'`“”‘’>])$/.exec(v);
    if (q) v = q[2].trim();
  }
  v = v.replace(/\s+/g, ""); // a link never contains spaces
  return v.replace(/^webcals?:\/\//i, "https://");
}

export const secrets = {
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  elevenLabsKey: process.env.ELEVENLABS_API_KEY || "",
  // OpenAI text-to-speech (voice.provider "openai", and phone calls). Only ever read by the server.
  openaiKey: process.env.OPENAI_API_KEY || "",
  // The pre-rename variable is still honoured so an existing .env doesn't silently
  // turn the access token off.
  accessToken: process.env.JERICHO_ACCESS_TOKEN || process.env.JARVIS_ACCESS_TOKEN || "",
  // Phone calls (Twilio). Read here only; never sent to the browser or written to logs.
  twilioSid: process.env.TWILIO_ACCOUNT_SID || "",
  twilioToken: process.env.TWILIO_AUTH_TOKEN || "",
  twilioNumber: process.env.TWILIO_PHONE_NUMBER || "",
  myPhoneNumber: process.env.MY_PHONE_NUMBER || "",
  // Morning briefing calendar (a private iCal link). Listed here so it's scrubbed from logs,
  // as typed and as cleaned up (quotes and spaces removed, webcal:// turned into https://).
  calendarIcsUrl: process.env.CALENDAR_ICS_URL || "",
  calendarIcsUrlFromSettings: settings.briefing?.calendarIcsUrl || "",
  calendarIcsUrlClean: cleanCalendarLink(process.env.CALENDAR_ICS_URL),
  calendarIcsUrlFromSettingsClean: cleanCalendarLink(settings.briefing?.calendarIcsUrl),
  // the TV's home-network address (not a key, but no reason to spread it around)
  rokuIp: process.env.ROKU_IP || "",
};
if (!process.env.JERICHO_ACCESS_TOKEN && process.env.JARVIS_ACCESS_TOKEN) {
  console.warn("⚠️  Rename JARVIS_ACCESS_TOKEN to JERICHO_ACCESS_TOKEN in .env (the old name still works for now).");
}

// The only settings the browser ever sees. No keys in here.
export function publicConfig() {
  return {
    assistantName: settings.assistantName,
    wakeWords: settings.wakeWords,
    endPhrases: settings.endPhrases || [],
    conversationTimeoutSeconds: settings.conversationTimeoutSeconds ?? 30,
    speechLang: settings.speechLang,
    // stray-turn filter for follow-ups without the wake word (see public/turnfilter.js)
    followUpFilter: settings.followUpFilter !== false,
    // after he answers, how long you can reply without the wake word
    followUpSeconds: Number(settings.followUpSeconds) > 0 ? Number(settings.followUpSeconds) : 8,
    // filled in by the server from voice.js (which voice the page speaks with)
    elevenLabsEnabled: false,
    bargeIn: {
      enabled: settings.bargeIn?.enabled !== false,
      // "wakeWord" (default): only "Jericho ..." or "stop" cuts him off; "loud": a clearly loud interruption too; "off"
      mode: ["wakeWord", "loud", "off"].includes(settings.bargeIn?.mode) ? settings.bargeIn.mode : "wakeWord",
      minLevel: Number(settings.bargeIn?.minVolume) > 0 ? Number(settings.bargeIn.minVolume) : Number(settings.bargeIn?.minLevel) > 0 ? Number(settings.bargeIn.minLevel) : 0.15,
      minMs: Number(settings.bargeIn?.minMs) > 0 ? Number(settings.bargeIn.minMs) : 270,
      calibrateMs: Number(settings.bargeIn?.calibrateMs) > 0 ? Number(settings.bargeIn.calibrateMs) : 1500,
      echoTailMs: Number(settings.bargeIn?.echoTailMs) >= 0 && settings.bargeIn?.echoTailMs !== "" && settings.bargeIn?.echoTailMs != null ? Number(settings.bargeIn.echoTailMs) : 700,
      duckTo: Number(settings.bargeIn?.duckTo) > 0 && Number(settings.bargeIn?.duckTo) <= 1 ? Number(settings.bargeIn.duckTo) : 0.85,
    },
  };
}
