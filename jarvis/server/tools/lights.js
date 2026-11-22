import { settings } from "../config.js";
import * as hue from "./lights/hue.js";
import * as kasa from "./lights/kasa.js";
import * as mock from "./lights/mock.js";

const providers = { mock, hue, kasa };
const provider = providers[settings.lights?.provider || "mock"] || mock;
const rooms = settings.lights?.rooms || [];

export const lightsTool = {
  risky: false,
  definition: {
    name: "lights",
    description:
      "Turn smart lights on or off, optionally setting brightness. Use room 'all' for every room. " +
      `Known rooms: ${rooms.join(", ")}.`,
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["on", "off"] },
        room: { type: "string", description: `One of: ${[...rooms, "all"].join(", ")}` },
        brightness: { type: "integer", minimum: 1, maximum: 100, description: "Percent, optional" },
      },
      required: ["action", "room"],
      additionalProperties: false,
    },
  },
  async run({ action, room, brightness }) {
    const target = String(room || "").toLowerCase().trim();
    const targets = target === "all" ? rooms : [target];
    if (target !== "all" && !rooms.includes(target)) {
      return { ok: false, error: `Unknown room "${room}". Known rooms: ${rooms.join(", ")}` };
    }
    const results = {};
    for (const r of targets) results[r] = await provider.setLight(r, action === "on", brightness);
    return { ok: true, provider: settings.lights?.provider || "mock", lights: results };
  },
};
