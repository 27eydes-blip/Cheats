// Tool registry. To add a tool: write { definition, risky, describe?, run } and list it here.
// Optional extras: precheck(input, ctx) runs before the yes/no question and can refuse;
// confirmPrompt(input) replaces the "Should I ...?" wording; announce is said before a slow tool runs.
import { makeCallTool, recentCallsTool } from "./calls.js";
import { claudeCodeResultTool, claudeCodeStatusTool, claudeCodeTool } from "./claudeCode.js";
import { deepThinkTool } from "./deepThink.js";
import { morningBriefingTool } from "./briefing.js";
import { saveLessonTool, whatIveLearnedTool } from "./learning.js";
import { lightsTool } from "./lights.js";
import { pcTools } from "./pc.js";
import { forgetTool, recallTool, rememberTool } from "./memory.js";
import { calendarAddTool, calendarListTool, musicTool } from "./placeholders.js";
import { checkCalendarTool, weatherTool } from "./weather.js";

const all = [
  lightsTool,
  claudeCodeTool,
  claudeCodeStatusTool,
  claudeCodeResultTool,
  calendarListTool,
  calendarAddTool,
  musicTool,
  rememberTool,
  recallTool,
  forgetTool,
  deepThinkTool,
  makeCallTool,
  recentCallsTool,
  saveLessonTool,
  whatIveLearnedTool,
  ...pcTools,
  morningBriefingTool,
  weatherTool,
  checkCalendarTool,
];

export const tools = new Map(all.map((t) => [t.definition.name, t]));
export const toolDefinitions = all.map((t) => t.definition);

export function isRisky(name, input) {
  const t = tools.get(name);
  if (!t) return false;
  return typeof t.risky === "function" ? t.risky(input) : Boolean(t.risky);
}

export function describeAction(name, input) {
  const t = tools.get(name);
  return t?.describe ? t.describe(input) : `use ${name}`;
}

/** Minimal check of a tool's input against its schema (streamed inputs can arrive cut short). */
export function validateInput(schema, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "input is not an object";
  for (const key of schema.required || []) {
    if (input[key] === undefined || input[key] === null || input[key] === "") return `missing "${key}"`;
  }
  for (const [key, value] of Object.entries(input)) {
    const prop = schema.properties?.[key];
    if (!prop) {
      if (schema.additionalProperties === false) return `unexpected field "${key}"`;
      continue;
    }
    const types = { string: "string", integer: "number", number: "number", boolean: "boolean", array: "object", object: "object" };
    if (prop.type && typeof value !== types[prop.type]) return `"${key}" should be ${prop.type}`;
    if (prop.type === "integer" && !Number.isInteger(value)) return `"${key}" should be a whole number`;
    if (prop.type === "array" && !Array.isArray(value)) return `"${key}" should be a list`;
    if (prop.enum && !prop.enum.includes(value)) return `"${key}" should be one of ${prop.enum.join(", ")}`;
    if (prop.type === "object" && prop.properties) {
      const inner = validateInput(prop, value);
      if (inner) return `${key}: ${inner}`;
    }
  }
  return null;
}
