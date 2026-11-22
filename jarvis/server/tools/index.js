// Tool registry. To add a tool: write { definition, risky, describe?, run } and list it here.
import { claudeCodeStatusTool, claudeCodeTool } from "./claudeCode.js";
import { lightsTool } from "./lights.js";
import { calendarAddTool, calendarListTool, musicTool } from "./placeholders.js";

const all = [
  lightsTool,
  claudeCodeTool,
  claudeCodeStatusTool,
  calendarListTool,
  calendarAddTool,
  musicTool,
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
