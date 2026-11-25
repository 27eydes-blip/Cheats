// Planner tools: homework, events, classes, free time and study plans (see server/planner/).
// Everything is your own data in data/planner.json, so only deleting asks for a yes.
// Results carry `say` (speak it) or `ask` (ask that one short question, then call again).
import * as planner from "../planner/index.js";

const obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const ASK_NOTE = "If the result has 'ask', ask the user exactly that one short question, then call again with their answer (an option date like 2026-11-27 works). Otherwise say the result's 'say' in your own short words.";

const tool = (name, description, schema, run, extra = {}) => ({ risky: false, definition: { name, description: `${description} ${ASK_NOTE}`, input_schema: schema }, run, ...extra });

export const plannerTools = [
  tool(
    "add_homework",
    "Add homework to the planner: 'add 40 minutes of accounting homework due tomorrow', 'I have a calc worksheet due Friday at 9am'. due is how they said it ('tomorrow', 'Friday 3pm', 'Dec 4'); minutes is the estimate ('40 minutes', 'an hour and a half'), left out if they didn't say.",
    obj({ title: { type: "string", description: "Short name, e.g. 'Accounting homework'" }, subject: { type: "string" }, due: { type: "string" }, minutes: { type: "string" } }, ["title", "due"]),
    async (i) => planner.addHomework(i),
  ),
  tool(
    "add_event",
    "Add an event or test to the planner: 'I have a physics test Friday', 'dentist Tuesday at 4', 'soccer every Monday at 6'. when is how they said it; no time means all day. kind is e.g. test, quiz, exam, appointment, practice. repeat 'weekly' for every week.",
    obj({ title: { type: "string" }, when: { type: "string" }, end: { type: "string", description: "End time if said, e.g. '5:30 pm'" }, minutes: { type: "string", description: "Length if said, e.g. '90 minutes'" }, kind: { type: "string" }, repeat: { type: "string", enum: ["none", "weekly"] }, location: { type: "string" } }, ["title", "when"]),
    async (i) => planner.addEvent(i),
  ),
  tool(
    "set_classes",
    "Set their weekly class schedule by voice: 'Calc is Monday Wednesday Friday 9 to 9:50, History Tuesday Thursday 1 to 2:15'. days like 'MWF', 'tues and thurs'; start and end like '9', '1:00 pm'. replace true replaces the whole schedule, false adds to it.",
    obj({ classes: { type: "array", items: obj({ title: { type: "string" }, days: { type: "string" }, start: { type: "string" }, end: { type: "string" }, location: { type: "string" } }, ["title", "days", "start", "end"]) }, replace: { type: "boolean" } }, ["classes"]),
    async (i) => planner.setClasses(i),
  ),
  tool("list_week", "What's on this week (or next week): classes, events, homework due, hours of work left and free time.", obj({ week: { type: "string", enum: ["this", "next"] } }), async (i) => planner.listWeek(i)),
  tool("list_due", "Homework still to do, due today, tomorrow or this week (overdue included for the week).", obj({ range: { type: "string", enum: ["today", "tomorrow", "week"] } }), async (i) => planner.listDue(i)),
  tool("complete_homework", "Check homework off ('I finished the accounting homework'), or done false to reopen it.", obj({ which: { type: "string" }, done: { type: "boolean" } }, ["which"]), async (i) => planner.completeHomework(i)),
  tool("move_item", "Move homework (its due date), an event or a study block to another day or time: 'move my physics test to Monday', 'push the essay to Friday'.", obj({ which: { type: "string" }, to: { type: "string" } }, ["which", "to"]), async (i) => planner.moveItem(i)),
  {
    // deleting is hard to undo: the system reads it back and waits for a yes
    risky: true,
    precheck(input) {
      const r = planner.resolveItem(input.which);
      return r.ok ? { ok: true } : { ok: false, reason: r.ask || r.error };
    },
    confirmPrompt(input) {
      const r = planner.resolveItem(input.which);
      return `Should I delete ${r.ok ? r.item.title : input.which} from your planner?`;
    },
    describe: (input) => `delete ${input.which} from your planner`,
    definition: { name: "delete_item", description: `Delete something from the planner (asks for a yes first). ${ASK_NOTE}`, input_schema: obj({ which: { type: "string" } }, ["which"]) },
    run: async (i) => planner.deleteItem(i),
  },
  tool("find_free_time", "Free time from the planner and their calendar: 'when am I free Thursday for 90 minutes'. day as said ('Thursday', 'tomorrow'), left out for the next week.", obj({ day: { type: "string" }, minutes: { type: "string" } }), async (i) => planner.findFreeTime(i)),
  tool("plan_week", "'Plan my week': draft study blocks before each due date, in free time. They're drafts until they accept them.", obj({}), async () => planner.planMyWeek()),
  tool("review_plan", "Accept or reject the drafted study blocks ('accept the plan', 'drop the physics blocks').", obj({ action: { type: "string", enum: ["accept", "reject"] }, which: { type: "string" } }, ["action"]), async (i) => planner.reviewPlan(i)),
  tool("open_planner", "Open the Planner panel on their screen ('open my planner', 'show my calendar').", obj({}), async () => ({ ok: true, say: "Here's your planner." }), { card: () => ({ kind: "open-planner" }) }),
];

export const PLANNER_FAST_TOOLS = ["add_homework", "add_event", "list_week", "list_due", "complete_homework", "move_item", "find_free_time", "review_plan", "open_planner"];
