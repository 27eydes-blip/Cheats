// The LG webOS TVs by room (see server/lg/). Everything here is safe-tier: your own TVs.
// Pairing runs in the background: Jericho says to watch for the prompt, then announces the result.
import { findRoom, lgAllOff, lgCommand, lgSettings, pairRoom, resolveRoom, ACTIONS, ROOM_QUESTION } from "../lg/index.js";
import { jobEvents } from "./claudeCode.js";

let pairing = null; // one pairing at a time

/** Starts pairing a room in the background. Returns what to say now. */
export function startPairing(room, { announce = (t) => jobEvents.emit("announce", t) } = {}) {
  if (pairing) return { ok: false, error: `I'm already pairing the ${pairing} TV. Give it a minute.` };
  pairing = room;
  let prompted = false;
  pairRoom(room, {
    onPrompt: () => {
      if (prompted) return;
      prompted = true;
      announce(`There's a pairing prompt on the TV now. Press Accept with its remote.`);
    },
  })
    .then((r) => announce(r.ok ? r.say : r.error))
    .catch(() => announce(`Pairing the ${room} TV failed.`))
    .finally(() => (pairing = null));
  return {
    ok: true,
    say: `Looking for the ${room} TV. A pairing prompt will pop up on it in a moment: accept it with the TV's remote.`,
  };
}

export const lgTvTool = {
  risky: false,
  definition: {
    name: "lg_tv",
    description:
      "Control the two LG TVs, by room: 'living room' or 'blue room' (also 'living room TV', 'the blue room'). Use it for any TV request unless they say Roku. " +
      "room: the room as they said it, 'all' to turn off every LG TV, or leave it out to use the last room. If the result has 'ask', ask exactly that. " +
      "Actions: power_on, power_off, volume_set (volume 0-100), volume_up / volume_down (steps), mute, unmute, open_app (app, e.g. Netflix, YouTube), play, pause, input (e.g. 'HDMI 2'), status, pair (pair a room's TV; they accept a prompt on the TV). Say the result's 'say' or 'error' briefly.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: [...ACTIONS, "pair"] },
        room: { type: "string" },
        volume: { type: "integer" },
        steps: { type: "integer" },
        app: { type: "string" },
        input: { type: "string" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  async run(input) {
    const cfg = lgSettings();
    if (input.action === "pair") {
      const room = findRoom(input.room || "", cfg);
      if (!room || room === "all") return { ok: false, ask: `Which TV should I pair: ${ROOM_QUESTION(cfg).replace("?", "")}?` };
      return startPairing(room);
    }
    const r = resolveRoom(input.room || "", { allowAll: input.action === "power_off", cfg });
    if (!r.ok) return { ok: false, ask: r.ask };
    if (r.room === "all") return lgAllOff(cfg);
    return lgCommand(r.room, input.action, input, cfg);
  },
};
