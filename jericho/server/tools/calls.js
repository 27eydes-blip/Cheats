// Phone call tools. make_call is risky: rules are checked first, then Jericho reads back
// the number, the goal and what it will say, and only dials after a spoken yes.
import { describeOwnerPlan, describePlan, listCalls, precheck, precheckOwner, startCall, startOwnerCall } from "../calls/manager.js";
import { normalizeNumber, PURPOSES, callSettings } from "../calls/policy.js";

export const makeCallTool = {
  risky: true,
  /** Runs before the confirmation question, so blocked calls are refused straight away. */
  precheck: (input, ctx) => precheck(input, ctx.client),
  confirmPrompt: (input) => describePlan(input, normalizeNumber(input.phoneNumber, callSettings().defaultCountryCode) || input.phoneNumber),
  describe: (input) => `call ${input.businessName}`,
  definition: {
    name: "make_call",
    description:
      "Phone a business for the user: a restaurant reservation, checking opening hours, booking an appointment, " +
      "or one simple question. Before calling you must know the business name and its phone number (look it up " +
      "with web_search or ask; never guess), and for bookings the date, time, party size and the name to book under. " +
      "Ask for anything missing first. The system reads the plan back to the user and only dials after a yes. " +
      "The call runs in the background and the user hears the outcome when it ends.",
    input_schema: {
      type: "object",
      properties: {
        businessName: { type: "string" },
        phoneNumber: { type: "string", description: "The business's number, as found or given" },
        purpose: { type: "string", enum: PURPOSES },
        goal: { type: "string", description: "One sentence, e.g. 'Book a table for four this Friday at seven PM'" },
        details: {
          type: "object",
          properties: {
            date: { type: "string", description: "Spoken form, e.g. 'this Friday, November twenty seventh'" },
            time: { type: "string" },
            partySize: { type: "integer" },
            name: { type: "string", description: "Name for the booking" },
            flexibility: { type: "string", description: "What alternatives are acceptable, if the user said" },
            notes: { type: "string" },
          },
          additionalProperties: false,
        },
        plan: { type: "string", description: "What you'll ask for after introducing yourself, in one sentence" },
      },
      required: ["businessName", "phoneNumber", "purpose", "goal", "plan"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    return startCall(input, ctx.client);
  },
};

// The one person Jericho may phone: you, at MY_PHONE_NUMBER in .env. There's no number field on
// purpose: the server dials that number and nothing else, so no one (not even Claude) can point
// an owner call somewhere else. Same yes, limits and webhook checks as every call.
export const callOwnerTool = {
  risky: true,
  precheck: (input) => precheckOwner(input),
  confirmPrompt: (input) => describeOwnerPlan(input),
  describe: () => "call your phone",
  definition: {
    name: "call_owner",
    description:
      "Phone the user's own cell (their number is set up already; never ask for it or say it). Use it when they say " +
      "\"call me\", \"call my phone\", \"give me a call and say hi\", or ask you to ring them with a message or reminder later in a " +
      "conversation. The call opens with \"Hey <their name>, it's Jericho\", then does what they asked. The system reads the plan back " +
      "and only dials after a yes. This is the only person you can call; other people are never allowed.",
    input_schema: {
      type: "object",
      properties: {
        task: { type: "string", description: "What to do on the call, in one sentence, e.g. 'Say hi and ask how their day is going'" },
        kind: { type: "string", enum: ["message", "reminder", "chat"] },
        message: { type: "string", description: "Exact words to pass on, if they gave any" },
      },
      required: ["task", "kind"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    return startOwnerCall(input, ctx.client);
  },
};

export const recentCallsTool = {
  risky: false,
  definition: {
    name: "recent_calls",
    description: "List the last few phone calls Jericho made and how they went.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  async run() {
    return {
      calls: listCalls()
        .slice(-5)
        .map((c) => ({ business: c.businessName, when: c.createdAt, test: c.test, status: c.status, outcome: c.outcome, summary: c.summary })),
    };
  },
};
