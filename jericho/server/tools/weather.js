// The weather tool (today, tomorrow, the weekend, a weekday, the next few days) and the
// "check my calendar" test. Same Open-Meteo data, location and 5-minute cache as the briefing.
import { checkCalendar } from "../briefing/calendar.js";
import { getForecast } from "../briefing/weather.js";

export const weatherTool = {
  risky: false,
  definition: {
    name: "weather",
    description:
      "Weather forecast for the user's location (from settings): high and low, rain chance, sky and a one-line tip per day. " +
      "Use it for 'what's the weather tomorrow', 'will it rain this weekend', 'weather for Friday', 'next few days'. " +
      "Answer in one or two short spoken sentences.",
    input_schema: {
      type: "object",
      properties: {
        when: { type: "string", description: "today, tomorrow, this weekend, a weekday like Friday, next few days, or this week" },
      },
      required: ["when"],
      additionalProperties: false,
    },
  },
  async run({ when }) {
    return getForecast(when);
  },
};

export const checkCalendarTool = {
  risky: false,
  definition: {
    name: "check_calendar",
    description:
      "Test the calendar link: says whether it works and how many events are on today, or exactly what's wrong and how to fix it. " +
      "Use it for 'check my calendar', 'is my calendar linked', 'why can't you see my calendar'. Never say the link itself.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  async run() {
    const r = await checkCalendar();
    return { status: r.status, result: r.reason, ...(r.calendar ? { today: r.calendar.today } : {}) };
  },
};
