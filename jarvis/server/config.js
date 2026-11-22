// Loads settings.json (non-secret, safe to edit) and .env (secrets).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load .env without a dependency (Node >= 20.12). Real env vars win.
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  /* no .env file: rely on the real environment */
}

export function expandHome(p) {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

export function loadSettings() {
  const file = process.env.JARVIS_SETTINGS || path.join(ROOT, "settings.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export const settings = loadSettings();

export const secrets = {
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  elevenLabsKey: process.env.ELEVENLABS_API_KEY || "",
  accessToken: process.env.JARVIS_ACCESS_TOKEN || "",
};

// The only settings the browser ever sees. No keys in here.
export function publicConfig() {
  return {
    assistantName: settings.assistantName,
    wakeWords: settings.wakeWords,
    speechLang: settings.speechLang,
    elevenLabsEnabled: Boolean(secrets.elevenLabsKey),
  };
}
