// Calendar and music placeholders. Each one tells Claude it isn't connected yet,
// so Jarvis says so out loud instead of pretending. Fill in run() later.

export const calendarListTool = {
  risky: false,
  definition: {
    name: "calendar_list_events",
    description: "List upcoming calendar events in a date range. (Not connected yet.)",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "ISO date, e.g. 2026-11-22" },
        to: { type: "string", description: "ISO date" },
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
  },
  async run() {
    // TODO: Google Calendar API (events.list) or CalDAV.
    return { ok: false, error: "The calendar isn't connected yet." };
  },
};

export const calendarAddTool = {
  // Creating an event can email invitations to other people, so it is gated.
  risky: true,
  describe: ({ title, start }) => `add "${title}" to your calendar at ${start}`,
  definition: {
    name: "calendar_add_event",
    description: "Create a calendar event (may send invitations). (Not connected yet.)",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        start: { type: "string", description: "ISO date-time" },
        durationMinutes: { type: "integer" },
        attendees: { type: "array", items: { type: "string" } },
      },
      required: ["title", "start"],
      additionalProperties: false,
    },
  },
  async run() {
    // TODO: Google Calendar API (events.insert).
    return { ok: false, error: "The calendar isn't connected yet." };
  },
};

export const musicTool = {
  risky: false,
  definition: {
    name: "music",
    description: "Play, pause or skip music, or play a specific song/artist/playlist. (Not connected yet.)",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["play", "pause", "next", "previous"] },
        query: { type: "string", description: "What to play, for action=play" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  async run() {
    // TODO: Spotify Web API (/v1/me/player/play etc.) or Apple Music via AppleScript.
    return { ok: false, error: "Music isn't connected yet." };
  },
};
