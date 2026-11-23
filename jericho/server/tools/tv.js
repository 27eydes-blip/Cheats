// The Roku TV tool: power, volume, remote buttons, open apps, search, what's playing, list apps.
// Talks only to a Roku on the home network (see server/roku/ecp.js). Every action is logged.
import { logAction } from "../logger.js";
import { CANT_WAKE, keyFor, matchApp, NOT_REACHABLE, Roku, RokuError } from "../roku/ecp.js";

export const roku = new Roku();

const ACTIONS = ["power_on", "power_off", "volume_up", "volume_down", "mute", "press", "open_app", "search", "now_playing", "list_apps"];
const BUTTONS = ["home", "back", "up", "down", "left", "right", "select", "play_pause", "rewind", "fast_forward", "replay", "info"];

const sizeOnly = (s) => (s ? `[${String(s).length} characters]` : undefined);
const fmtTime = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};

async function run(input, tv = roku) {
  const { action } = input;
  switch (action) {
    case "power_on": {
      let info = null;
      try {
        info = await tv.deviceInfo();
      } catch (err) {
        // not answering at all: it may be fully off, which ECP can't wake on every model
        if (err.code === "unreachable") return { ok: false, error: CANT_WAKE };
        throw err;
      }
      if (info.powerMode === "PowerOn") return { ok: true, said: "The TV is already on." };
      try {
        await tv.keypress("PowerOn");
      } catch (err) {
        if (err.code !== "http") throw err;
        await tv.keypress("Power"); // older models only have the toggle (it was off, so this turns it on)
      }
      return { ok: true, said: "Turning the TV on." };
    }
    case "power_off": {
      try {
        await tv.keypress("PowerOff");
      } catch (err) {
        if (err.code !== "http") throw err;
        const info = await tv.deviceInfo();
        if (info.powerMode && info.powerMode !== "PowerOn") return { ok: true, said: "The TV is already off." };
        await tv.keypress("Power");
      }
      return { ok: true, said: "Turning the TV off." };
    }
    case "volume_up":
    case "volume_down": {
      const times = Math.min(20, Math.max(1, Math.round(Number(input.times) || 1)));
      const key = action === "volume_up" ? "VolumeUp" : "VolumeDown";
      for (let i = 0; i < times; i++) {
        await tv.keypress(key);
        if (i < times - 1) await tv.sleep(120);
      }
      return { ok: true, said: `Volume ${action === "volume_up" ? "up" : "down"} ${times}.` };
    }
    case "mute":
      await tv.keypress("VolumeMute");
      return { ok: true, said: "Mute toggled." };
    case "press": {
      const key = keyFor(String(input.button || "").replace(/_/g, " "));
      if (!key) return { ok: false, error: `I don't know the ${input.button} button.` };
      await tv.keypress(key);
      return { ok: true, said: `Pressed ${input.button}.` };
    }
    case "list_apps": {
      const apps = (await tv.apps()).filter((a) => !a.type || a.type === "appl");
      return { ok: true, count: apps.length, apps: apps.map((a) => a.name) };
    }
    case "open_app": {
      const apps = await tv.apps();
      const app = matchApp(apps, input.app);
      if (!app) return { ok: false, error: `${input.app} isn't installed on the TV.`, installed: apps.filter((a) => a.type === "appl").map((a) => a.name).slice(0, 30) };
      await tv.launch(app.id);
      return { ok: true, said: `Opening ${app.name}.`, app: app.name };
    }
    case "search": {
      const query = String(input.query || "").trim();
      if (!query) return { ok: false, error: "Nothing to search for." };
      let app = null;
      if (input.app) {
        app = matchApp(await tv.apps(), input.app);
        if (!app) return { ok: false, error: `${input.app} isn't installed on the TV.` };
      }
      if (await tv.search(query, app?.id)) return { ok: true, said: `Searching${app ? ` ${app.name}` : ""} for ${query}.` };
      // older firmware without ECP search: open the app and type into its search box
      if (app) {
        await tv.launch(app.id);
        await tv.sleep(2500);
      }
      await tv.type(query);
      return { ok: true, said: `Typed ${query} into the search box on screen.`, note: "If the search box wasn't open, they may need to open the app's search first." };
    }
    case "now_playing": {
      const n = await tv.nowPlaying();
      if (n.screensaver) return { ok: true, said: "The screensaver is on." };
      if (n.home || !n.app) return { ok: true, said: "The TV is on the home screen." };
      const where = n.positionMs ? `, ${fmtTime(n.positionMs)} in${n.durationMs ? ` of ${fmtTime(n.durationMs)}` : ""}` : "";
      const state = n.state === "pause" ? " (paused)" : "";
      return { ok: true, app: n.app, title: n.title || null, said: n.title ? `${n.title} on ${n.app}${where}${state}.` : `${n.app} is open${state}${where}. The TV doesn't say the title.` };
    }
    default:
      return { ok: false, error: `Unknown TV action ${action}.` };
  }
}

export const tvTool = {
  risky: false,
  definition: {
    name: "tv",
    description:
      "Control the Roku TV on the home network. Use it whenever they mention the TV or Roku, or want to watch something on the TV " +
      "(for apps on this PC use open_app instead). Actions: power_on, power_off, volume_up/volume_down (times, e.g. 5), mute, " +
      "press (button: home, back, up, down, left, right, select, play_pause, rewind, fast_forward, replay, info), " +
      "open_app (app: a name like Netflix, YouTube, Hulu, Disney+, Max, Prime Video, Spotify), search (query, optional app), " +
      "now_playing, list_apps. Say the result's 'said' or 'error' briefly.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ACTIONS },
        times: { type: "integer", description: "For volume: how many steps (1-20)" },
        button: { type: "string", enum: BUTTONS },
        app: { type: "string", description: "App name, for open_app or search" },
        query: { type: "string", description: "What to search for" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  async run(input) {
    return runTv(input);
  },
};

/** Runs one action with the friendly errors, and logs it. (Exported for tests.) */
export async function runTv(input, tv = roku) {
  const t0 = Date.now();
  let result;
  try {
    result = await run(input, tv);
  } catch (err) {
    const message = err instanceof RokuError ? err.message : NOT_REACHABLE;
    result = { ok: false, error: message, reason: err.code || "error" };
  }
  logAction("tv_action", {
    action: input.action,
    ...(input.button ? { button: input.button } : {}),
    ...(input.times ? { times: input.times } : {}),
    ...(input.app ? { app: String(input.app).slice(0, 40) } : {}),
    ...(input.query ? { query: sizeOnly(input.query) } : {}),
    ok: result.ok,
    ...(result.ok ? {} : { reason: result.reason || "refused" }),
    via: tv.source || undefined,
    ms: Date.now() - t0,
  });
  return result;
}
