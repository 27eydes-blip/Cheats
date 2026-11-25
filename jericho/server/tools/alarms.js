// Alarm tools: set_alarm, list_alarms, cancel_alarm. Times are US Eastern (settings.alarms.timezone).
// Cancelling all alarms needs a spoken yes; everything is logged by the alarm manager.
import { alarms } from "../alarms/manager.js";
import { WAKE_TIMER_HELP, WAKE_WARNING, wakeTimersStatus } from "../alarms/wake.js";

let wakeTimersChecked = false; // mention wake-timer problems once per server run

export const setAlarmTool = {
  risky: false,
  definition: {
    name: "set_alarm",
    description:
      "Set an alarm. time is a clock time in US Eastern, like '7:00 AM', '6:45', '19:30' or 'noon'. " +
      "If that time has already passed today it's set for tomorrow. repeat: once (default), daily or weekdays. " +
      "After it's set, say the exact day and time from the result's 'say' field. Mention 'wakeNote' briefly if present.",
    input_schema: {
      type: "object",
      properties: {
        time: { type: "string", description: "Clock time in US Eastern, e.g. '7:00 AM'" },
        label: { type: "string", description: "Optional name, e.g. 'gym'" },
        repeat: { type: "string", enum: ["once", "daily", "weekdays"] },
      },
      required: ["time"],
      additionalProperties: false,
    },
  },
  async run({ time, label = "", repeat = "once" }) {
    const r = await alarms.set({ time, label, repeat });
    if (!r.ok) return r;
    const a = r.alarm;
    const rep = a.repeat === "daily" ? ", and every day after that" : a.repeat === "weekdays" ? ", and every weekday after that" : "";
    const out = { ok: true, number: a.number, say: `Alarm set for ${a.when}${rep}${a.label ? `, labelled ${a.label}` : ""}.`, alarm: a };
    // waking the laptop (Windows): say plainly if it can't
    const notes = [];
    if (r.wake?.status === "needs-elevation") notes.push(`Windows needs admin rights to create the wake task. The user can run this one line in an admin PowerShell: ${r.wake.command}`);
    else if (r.wake?.status === "failed") notes.push("The wake task couldn't be created, so the alarm only rings if Jericho is open and the laptop is awake.");
    if (r.wake?.ok && !wakeTimersChecked) {
      wakeTimersChecked = true;
      const w = await wakeTimersStatus().catch(() => ({ status: "unknown" }));
      if (w.status !== "enabled" && w.status !== "not-windows") notes.push(`Wake timers look ${w.status === "unknown" ? "unknown" : w.status} in Windows power settings, so the laptop may not wake. ${WAKE_TIMER_HELP}`);
      notes.push(WAKE_WARNING);
    }
    if (notes.length) out.wakeNote = notes.join(" ");
    return out;
  },
};

export const listAlarmsTool = {
  risky: false,
  definition: {
    name: "list_alarms",
    description: "List the alarms that are set, numbered in the order they'll ring (times in US Eastern).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  async run() {
    const list = alarms.list();
    return { count: list.length, alarms: list.map((a) => ({ number: a.number, when: a.when, label: a.label, repeat: a.repeat, ringing: a.state === "ringing" })) };
  },
};

export const cancelAlarmTool = {
  // your own alarms: cancelled straight away, even several (the result says which, so they can be set again)
  risky: false,
  confirmPrompt: (input) => {
    const n = alarms.resolve(input?.which).length;
    const total = alarms.list().length;
    if (n === total) return total === 1 ? "Should I cancel your only alarm?" : `Should I cancel all ${total} alarms?`;
    return `Should I cancel ${n} alarms?`;
  },
  definition: {
    name: "cancel_alarm",
    description: "Cancel an alarm by its number from list_alarms, its label, or 'all'. Say which ones were cancelled.",
    input_schema: {
      type: "object",
      properties: { which: { type: "string", description: "A number ('2'), a label ('gym'), or 'all'" } },
      required: ["which"],
      additionalProperties: false,
    },
  },
  async run({ which }) {
    const cancelled = await alarms.cancel(which);
    if (!cancelled.length) return { ok: false, error: `No alarm matches "${String(which).slice(0, 40)}".`, alarms: alarms.list().map((a) => ({ number: a.number, when: a.when, label: a.label })) };
    return { ok: true, cancelled: cancelled.map((a) => ({ when: a.when, label: a.label })) };
  },
};

export const alarmTools = [setAlarmTool, listAlarmsTool, cancelAlarmTool];
