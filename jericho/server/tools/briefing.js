// The morning briefing tool: gathers calendar, weather and markets (each may be skipped),
// and the page shows the same info as a Briefing card.
import { getBriefing } from "../briefing/index.js";
import { DISCLAIMER } from "../briefing/markets.js";

export const morningBriefingTool = {
  risky: false,
  announce: ["One sec, pulling it together.", "Let me grab today's rundown.", "Getting your briefing."],
  definition: {
    name: "morning_briefing",
    description:
      "Get the morning briefing: today's calendar and tomorrow's first event, the local weather (today and tomorrow), and how stock futures and Bitcoin are moving. " +
      "Use it for 'good morning', 'morning briefing', 'brief me' and similar.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  async run() {
    const b = await getBriefing();
    return {
      ...b,
      howToSpeak:
        `Speak it in under 45 seconds (at most 100 words). Start with "Morning${b.name ? `, ${b.name}` : ""}" and keep it warm and quick, matched to how they talk. ` +
        "Order: calendar (today's events briefly, then tomorrow's first), weather (temperature now, high and low, rain chance, and the advice line, " +
        "then tomorrow in one short sentence from weather.tomorrow, e.g. 'Tomorrow, 52 and rainy.'), " +
        "markets (each one's direction and percent, rounded to one decimal, no prices). " +
        `If markets are included, end with: "${DISCLAIMER}" ` +
        "If a part has ok false, say in a few words that you couldn't get it and move on. No lists or symbols.",
    };
  },
  /** What the page shows in the chat panel. */
  card(result) {
    return { kind: "briefing", name: result.name, date: result.date, calendar: result.calendar, weather: result.weather, markets: result.markets };
  },
};
