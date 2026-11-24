// How fast was that? For every turn, the time from the end of your speech to each stage of the
// reply. Shared by the page (the readout in the sun panel, Copy diagnostics) and the server
// (logs/latency.log), and the tests. Only numbers: never what was said.

/** The stages, in the order they normally happen. */
export const STAGES = ["final", "sent", "token", "sentence", "audioByte", "playing"];
export const STAGE_NAMES = {
  final: "transcript final",
  sent: "request sent",
  token: "first Claude token",
  sentence: "first full sentence",
  audioByte: "first audio byte",
  playing: "audio playing",
};
export const ROUTES = ["fast", "strong", "local"];
const MAX_MS = 120_000;

/**
 * marks: { end, final, sent, token, sentence, audioByte, playing } as performance.now() times.
 * `end` is when you stopped talking (for a typed request, when it was sent). Returns each stage
 * in ms after the end of speech, rounded; a stage that didn't happen is left out.
 */
export function turnLatency(marks = {}) {
  const end = Number.isFinite(marks.end) ? marks.end : Number.isFinite(marks.final) ? marks.final : marks.sent;
  const out = {};
  if (!Number.isFinite(end)) return out;
  for (const s of STAGES) {
    const t = marks[s];
    if (Number.isFinite(t)) out[s] = Math.max(0, Math.min(MAX_MS, Math.round(t - end)));
  }
  return out;
}

/** Keeps only known stage numbers and labels, so nothing personal can end up in the log. */
export function cleanLatency(entry = {}) {
  const out = {};
  for (const s of STAGES) {
    const v = Number(entry[s]);
    if (entry[s] != null && entry[s] !== "" && Number.isFinite(v) && v >= 0 && v <= MAX_MS) out[s] = Math.round(v);
  }
  if (ROUTES.includes(entry.route)) out.route = entry.route;
  if (["elevenlabs", "openai", "browser", "mixed"].includes(entry.voice)) out.voice = entry.voice;
  if (Array.isArray(entry.models)) {
    const models = entry.models.map(String).filter((m) => /^claude-[a-z0-9.-]{1,40}$/.test(m)).slice(0, 4);
    if (models.length) out.models = models;
  }
  if (typeof entry.ack === "boolean") out.ack = entry.ack;
  if (typeof entry.typed === "boolean") out.typed = entry.typed;
  if (typeof entry.early === "boolean") out.early = entry.early;
  if (entry.fallback === "browser-voice" || entry.fallback === "apology") out.fallback = entry.fallback;
  return out;
}

/** The last N turns, with the newest one and the average of each stage. */
export class LatencyTracker {
  constructor(size = 10, entries = []) {
    this.size = size;
    this.entries = entries.map(cleanLatency).slice(-size);
  }

  add(entry) {
    const e = cleanLatency(entry);
    this.entries.push(e);
    if (this.entries.length > this.size) this.entries.splice(0, this.entries.length - this.size);
    return e;
  }

  last() {
    return this.entries.at(-1) || null;
  }

  average() {
    const out = {};
    for (const s of STAGES) {
      const vals = this.entries.map((e) => e[s]).filter(Number.isFinite);
      if (vals.length) out[s] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    return out;
  }
}

/** "1.2 s" or "850 ms". */
export function formatMs(ms) {
  if (!Number.isFinite(ms)) return "–";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/** The number that matters most: when you started hearing the answer. */
export const heardAt = (e) => (e ? e.playing ?? e.sentence ?? null : null);

/** The sun-panel readout: two short lines. */
export function formatReadout(tracker) {
  const last = tracker.last();
  if (!last) return { headline: "No turns measured yet.", detail: "" };
  const avg = tracker.average();
  const n = tracker.entries.length;
  const headline = `Last: voice in ${formatMs(heardAt(last))} · average of ${n}: ${formatMs(heardAt(avg))}`;
  const detail = STAGES.filter((s) => last[s] != null)
    .map((s) => `${STAGE_NAMES[s]} ${formatMs(last[s])}`)
    .join(" → ");
  return { headline, detail: `${detail}${last.route ? ` (${last.route} route)` : ""}` };
}
