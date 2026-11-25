// Plain spoken plug commands handled locally (no Claude call): "turn off the fan", "turn the lamp
// on", "toggle the lamp", "is the fan on?", "turn everything off", "all lights off",
// "turn off the fan in 30 minutes", "cancel the fan timer".
import { parseDuration } from "../planner/dates.js";
import { findTarget, plugSettings } from "./index.js";

const FILLER = /\b(please|jericho|jer|hey|okay|ok|now|for me|could you|can you|would you|just|quickly)\b/g;
function tidy(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9.' ]+/g, " ")
    .replace(/\.(?!\d)/g, " ")
    .replace(FILLER, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** { kind: "plug", input: { action, plug | group | all, minutes } } or null. */
export function matchPlug(text, cfg = plugSettings()) {
  const t = tidy(text);
  if (!t || t.split(" ").length > 12) return null;
  if (/\b(tvs?|television|roku|living room|blue room)\b/.test(t)) return null; // the TVs have their own commands
  let m;
  const target = (s) => findTarget(s, cfg);
  const pack = (action, tg, extra = {}) => (tg ? { kind: "plug", input: { action, ...(tg.plug ? { plug: tg.plug } : tg.group ? { group: tg.group } : { all: true }), ...extra } } : null);

  // timers
  if ((m = /^cancel (?:the |my )?(.+?) timers?$|^cancel (?:the |my )?(?:plug )?timers?(?: for (?:the |my )?(.+))?$/.exec(t))) {
    const tg = target(m[1] || m[2] || "");
    if (m[1] && !tg) return null;
    return { kind: "plug", input: { action: "cancel_timer", ...(tg?.plug ? { plug: tg.plug } : {}) } };
  }
  if ((m = /^(?:turn|switch|shut|power) (on|off) (.+?) in (.+)$|^(?:turn|switch|shut|power) (.+?) (on|off) in (.+)$|^(.+?) (on|off) in (.+)$/.exec(t))) {
    const action = m[1] || m[5] || m[8];
    const what = m[2] || m[4] || m[7];
    const minutes = parseDuration(m[3] || m[6] || m[9]);
    const tg = target(what);
    if (!tg?.plug || !minutes) return null;
    return { kind: "plug", input: { action: "timer", plug: tg.plug, then: action, minutes } };
  }
  // is it on?
  if ((m = /^is (?:the |my )?(.+?) (?:on|off|running|still on)$/.exec(t))) return pack("status", target(m[1]));
  if ((m = /^toggle (.+)$/.exec(t))) return pack("toggle", target(m[1]));
  if (/^(?:turn|switch|shut|power) (?:off )?everything(?: off)?$|^everything off$/.test(t)) return pack("off", { all: true });
  if ((m = /^(?:turn|switch|power) (on|off) (.+)$|^(?:turn|switch|power) (.+?) (on|off)$|^shut (?:off|down) (.+)$|^(.+?) (on|off)$/.exec(t))) {
    const action = m[1] || m[4] || (m[5] ? "off" : m[7]);
    return pack(action, target(m[2] || m[3] || m[5] || m[6]));
  }
  return null;
}
