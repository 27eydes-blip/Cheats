// Plain spoken LG TV commands handled locally (no Claude call): "turn off the blue room",
// "volume 15 in the living room", "put Netflix on in the blue room", "turn off all the TVs",
// "pair the living room TV". With no room named, the last room used. If that's unclear, the
// answer is "Living room or blue room?" and a bare "blue room" next finishes the command.
import { findRoom, lgSettings, loadKeys, resolveRoom } from "./index.js";

const APPS = ["netflix", "youtube", "hulu", "disney plus", "disney", "max", "hbo max", "prime video", "amazon prime", "amazon", "prime", "spotify", "peacock", "paramount plus", "paramount", "plex", "apple tv", "live tv", "tubi", "pluto"];
const PENDING_MS = 30_000;
let pending = null; // { input, until }

const FILLER = /\b(please|jericho|jer|hey|okay|ok|now|for me|could you|can you|would you|just|quickly)\b/g;
function tidy(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(FILLER, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripRoom(t, cfg) {
  let out = ` ${t} `;
  const aliases = cfg.rooms.flatMap((r) => r.aliases).sort((a, b) => b.length - a.length);
  for (const a of aliases) out = out.replace(new RegExp(`\\s(?:in |on |for |at )?(?:the )?${a.replace(/\s+/g, "\\s+")}(?: tv| television)?(?=\\s)`, "g"), " ");
  out = out
    .replace(/\s(?:in |on |for )?(?:all |both )?(?:of )?(?:the |my )?(?:lg )?(?:tvs?|televisions?|tv's)(?=\s)/g, " ")
    .replace(/\s(all|both|every)(?=\s)/g, " ");
  return out.replace(/\s+/g, " ").trim();
}

/** The command part, as an lg_tv input, or null when it isn't a plain TV command. */
function command(rest) {
  let m;
  if (/^pair(?: up)?$|^pair with$/.test(rest)) return { action: "pair" };
  if (/^(?:turn|switch|shut|power) off$|^(?:turn|switch|shut|power) (?:it )?off$|^off$|^shut down$/.test(rest)) return { action: "power_off" };
  if (/^(?:turn|switch|power) on$|^(?:turn|switch) (?:it )?on$|^on$|^wake(?: up)?$/.test(rest)) return { action: "power_on" };
  if ((m = /^(?:set |put |turn )?(?:the )?volume (?:to |at |on )?(\d{1,3})$|^(?:set |put |turn )?(?:it )?(?:to )?(\d{1,3}) volume$/.exec(rest))) return { action: "volume_set", volume: Number(m[1] || m[2]) };
  if (/^(?:turn (?:it |the volume )?up|volume up|louder|turn up the volume|turn the volume up|raise the volume)$/.test(rest)) return { action: "volume_up" };
  if (/^(?:turn (?:it |the volume )?down|volume down|quieter|softer|turn down the volume|turn the volume down|lower the volume)$/.test(rest)) return { action: "volume_down" };
  if (/^mute(?: it)?$/.test(rest)) return { action: "mute" };
  if (/^unmute(?: it)?$/.test(rest)) return { action: "unmute" };
  if (/^(?:pause(?: it)?|hit pause)$/.test(rest)) return { action: "pause" };
  if (/^(?:play|resume|unpause)(?: it)?$/.test(rest)) return { action: "play" };
  if ((m = /^(?:switch |go |change )?(?:to )?(?:hdmi|input) ?(\d)$/.exec(rest))) return { action: "input", input: `HDMI ${m[1]}` };
  if ((m = new RegExp(`^(?:put|open|launch|start|switch to|go to|play|pull up|bring up)(?: on)? (${APPS.join("|")})(?: on)?$`).exec(rest))) return { action: "open_app", app: m[1] };
  return null;
}

/**
 * { kind: "lg", input } (run lg_tv), { kind: "lg", ask } (ask which room), or null (not a plain
 * LG command: Claude or the Roku handles it).
 */
export function matchLg(text, now = Date.now(), cfg = lgSettings()) {
  const t = tidy(text);
  if (!t || t.split(" ").length > 12) return null;
  if (/\b(lights?|lamps?|bulbs?)\b/.test(t)) return null; // "turn off the living room lights" isn't the TV
  const room = findRoom(t, cfg);
  const roku = /\broku\b/.test(t);
  const rest = stripRoom(t.replace(/\b(?:and )?(?:the )?roku\b/g, " ").replace(/\s+/g, " "), cfg);

  // "blue room" on its own, right after "Living room or blue room?"
  if (pending && now < pending.until && room && room !== "all" && !rest) {
    const input = { ...pending.input, room };
    pending = null;
    return { kind: "lg", input };
  }
  if (roku && room !== "all") return null; // the Roku keeps its own commands
  const tvish = room || /\b(tvs?|televisions?|tv's)\b/.test(t);
  if (!tvish) return null;
  const paired = Object.keys(loadKeys().rooms).length > 0;
  if (!room && !paired) return null; // no LG yet: "the TV" still means the Roku
  const cmd = command(rest);
  if (!cmd) return null;
  if (cmd.action === "pair") {
    if (!room || room === "all") return { kind: "lg", ask: `Which TV should I pair: ${cfg.rooms.map((r) => r.name).join(" or ")}?` };
    return { kind: "lg", input: { action: "pair", room } };
  }
  if (room === "all") {
    if (cmd.action !== "power_off") return null;
    return { kind: "lg", input: { action: "power_off", room: "all" }, roku };
  }
  if (room) return { kind: "lg", input: { ...cmd, room } };
  const r = resolveRoom("", { cfg });
  if (r.ok) return { kind: "lg", input: { ...cmd, room: r.room } };
  pending = { input: cmd, until: now + PENDING_MS };
  return { kind: "lg", ask: r.ask };
}

/** Tests only. */
export function _clearPendingForTests() {
  pending = null;
}
