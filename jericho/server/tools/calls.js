// Phone call tools. make_call is risky: rules are checked first, then Jericho reads back
// the number, the goal and what it will say, and only dials after a spoken yes.
import { describeOwnerPlan, describePlan, listCalls, precheck, precheckOwner, resolveTarget, startCall, startOwnerCall, withGreetingName } from "../calls/manager.js";
import { normalizeNumber, PURPOSES, last4 } from "../calls/policy.js";
import { deleteContact, listContacts, saveContact } from "../contacts.js";

export const makeCallTool = {
  risky: true,
  /** Runs before the confirmation question, so blocked calls are refused straight away. */
  precheck: (input, ctx) => precheck(input, ctx.client),
  // the read-back: the number digit by digit (from the contact if one was named), who, and what
  confirmPrompt: (input) => {
    const t = resolveTarget(input);
    return describePlan(withGreetingName(input), (t.ok && normalizeNumber(t.raw, "1")) || input.phoneNumber);
  },
  describe: (input) => `call ${input.businessName}`,
  definition: {
    name: "make_call",
    description:
      "Phone a business or a person for the user, one call at a time. Businesses: a reservation, opening hours, an appointment or one " +
      "simple question (find the number with web_search or ask; never guess). People: pass on a message, ask a question, invite or remind " +
      "them (purpose personal), using the number the user said or a saved contact (contact). Ask for anything missing first. " +
      "The call opens with \"Hey <name>, I'm Jericho, <user>'s personal assistant\" (\"Hello, ...\" when there's no name), says it's an AI whenever asked, and never pretends to be anyone. " +
      "Set record true only if the user explicitly asked to record the call. The system reads the plan and the number back " +
      "and only dials after a spoken yes. The call runs in the background and the user hears the outcome when it ends.",
    input_schema: {
      type: "object",
      properties: {
        businessName: { type: "string", description: "Who you're calling: the business, or the person's name" },
        phoneNumber: { type: "string", description: "The number as found or said. Leave out when calling a saved contact" },
        contact: { type: "string", description: "A saved contact's name, instead of a number" },
        personName: { type: "string", description: "The person's name to greet, only if the user said it. Never guess one; leave out for businesses and unknown numbers (saved contacts fill it in)" },
        record: { type: "boolean", description: "Only if the user explicitly asked to record this call" },
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
      required: ["businessName", "purpose", "goal", "plan"],
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

// ---- contacts (data/contacts.json, local only) ----------------------------------------------
export const saveContactTool = {
  risky: false,
  definition: {
    name: "save_contact",
    description: "Save or update a contact's phone number (\"save Luke's number as 248 555 0123\"). Read the number back digit by digit afterwards.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" }, phoneNumber: { type: "string" } },
      required: ["name", "phoneNumber"],
      additionalProperties: false,
    },
  },
  async run({ name, phoneNumber }) {
    return saveContact(name, phoneNumber);
  },
};

export const listContactsTool = {
  risky: false,
  definition: {
    name: "list_contacts",
    description: "Who's in the user's contacts: names, with only the last 4 digits of each number.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  async run() {
    const contacts = listContacts().map((c) => ({ name: c.name, endsIn: last4(c.number).replace("...", "") }));
    return { count: contacts.length, contacts };
  },
};

export const deleteContactTool = {
  risky: true, // asks first
  confirmPrompt: (input) => `Should I delete ${String(input.name).slice(0, 60)} from your contacts?`,
  describe: (input) => `delete ${input.name} from your contacts`,
  definition: {
    name: "delete_contact",
    description: "Delete a saved contact (\"delete Luke from contacts\"). The system asks the user to confirm first.",
    input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false },
  },
  async run({ name }) {
    return deleteContact(name);
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
        .map((c) => ({ who: c.businessName, when: c.createdAt, test: c.test, status: c.status, outcome: c.outcome, summary: c.summary })),
    };
  },
};
