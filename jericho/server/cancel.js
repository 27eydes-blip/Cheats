// Everything that's running (Claude replies, commands, timers, Claude Code jobs, calls)
// registers here, so the kill switch ("Jericho, stop") can stop it all at once.

const active = new Set();

/** Register something that can be stopped. Returns a function to call when it ends normally. */
export function track(kind, label, cancel) {
  const handle = { kind, label: String(label || "").slice(0, 80), cancel };
  active.add(handle);
  return () => active.delete(handle);
}

/** Stop everything that's running. Returns what was stopped. */
export function cancelAll(reason = "stopped by the user") {
  const list = [...active];
  active.clear();
  for (const h of list) {
    try {
      h.cancel(reason);
    } catch {
      /* already finished */
    }
  }
  return list.map((h) => ({ kind: h.kind, label: h.label }));
}

export function runningCount() {
  return active.size;
}

const KILL_PHRASES = new Set([
  "stop", "stop it", "stop now", "stop that", "stop everything", "stop all", "stop all of it",
  "cancel everything", "cancel all", "cancel all of it", "cancel it all", "cancel that", "cancel",
  "abort", "abort everything", "abort all", "halt", "never mind stop", "stop stop",
]);

/** "Jericho, stop" / "cancel everything": the kill switch. Only short, exact phrases count. */
export function isKillPhrase(text) {
  const t = String(text || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(hey |ok |okay )?(jericho|jer|jerico|jerry co|jerr)\b ?/, "")
    .replace(/ (please|now|right now|jericho)$/, "")
    .trim();
  return KILL_PHRASES.has(t);
}
