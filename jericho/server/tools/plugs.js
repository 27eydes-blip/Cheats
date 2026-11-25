// plug_control: the Tapo smart plugs by name (see server/plugs/). Safe tier: your own plugs, no yes.
import { addTimer, cancelTimers, findTarget, listTimers, loadCache, plugAction, plugSettings, plugsAction } from "../plugs/index.js";
import { jobEvents } from "./claudeCode.js";

const announce = (t) => jobEvents.emit("announce", t);

/** Runs one parsed plug command (from the local matcher or from Claude). */
export async function runPlugCommand(input = {}) {
  const cfg = plugSettings();
  const names = cfg.devices.map((d) => d.name);
  const byName = (n) => cfg.devices.find((d) => d.name.toLowerCase() === String(n || "").toLowerCase())?.name || findTarget(n || "", cfg)?.plug || null;
  const action = input.action;
  if (action === "list") {
    const cache = loadCache().plugs;
    return { ok: true, plugs: names.map((n) => ({ name: n, found: Boolean(cache[n]) })), timers: listTimers().map((t) => ({ plug: t.plug, action: t.action, minutesLeft: Math.max(0, Math.round((t.at - Date.now()) / 60000)) })), say: `I control ${names.map((n) => n.toLowerCase()).join(" and ")}.` };
  }
  if (action === "cancel_timer") return cancelTimers(input.plug ? byName(input.plug) : null);
  if (action === "timer") {
    const plug = byName(input.plug);
    if (!plug) return { ok: false, ask: `Which plug: ${names.map((n) => n.toLowerCase()).join(" or ")}?` };
    return addTimer(plug, input.then === "on" ? "on" : "off", input.minutes, { announce });
  }
  if (!["on", "off", "toggle", "status"].includes(action)) return { ok: false, error: "Unknown plug action." };
  if (input.all) return plugsAction(names, action === "toggle" ? "off" : action, cfg);
  if (input.group) {
    const g = cfg.groups.find((x) => x.name === String(input.group).toLowerCase()) || cfg.groups.find((x) => x.aliases.includes(String(input.group).toLowerCase()));
    if (!g) return { ok: false, error: `I don't have a group called ${input.group}.` };
    if (action === "status") return Promise.all(g.devices.map((n) => plugAction(n, "status", cfg))).then((rs) => ({ ok: rs.some((r) => r.ok), say: rs.map((r) => r.say || r.error).join(" ") }));
    return plugsAction(g.devices, action === "toggle" ? "off" : action, cfg);
  }
  const plug = byName(input.plug);
  if (!plug) return { ok: false, ask: `Which plug: ${names.map((n) => n.toLowerCase()).join(" or ")}?` };
  return plugAction(plug, action, cfg);
}

export const plugControlTool = {
  risky: false,
  definition: {
    name: "plug_control",
    description:
      "Control the Tapo smart plugs by name (settings plugs.devices, e.g. Fan and Lamp; groups like 'lights'). " +
      "action: on, off, toggle, status ('is the fan on?'), timer (then: on or off, minutes: e.g. 30 for 'turn off the fan in 30 minutes'), cancel_timer, list. " +
      "plug: the plug's name; or group: a group name; or all: true for every plug ('turn everything off'). Say the result's 'say' or 'error' briefly; if it has 'ask', ask that.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["on", "off", "toggle", "status", "timer", "cancel_timer", "list"] },
        plug: { type: "string" },
        group: { type: "string" },
        all: { type: "boolean" },
        minutes: { type: "integer" },
        then: { type: "string", enum: ["on", "off"] },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  async run(input) {
    return runPlugCommand(input);
  },
};
