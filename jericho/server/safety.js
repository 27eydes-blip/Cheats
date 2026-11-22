// The safety layer. Decisions here are made by plain code, never by Claude:
// Claude can ask for a risky tool, but only the user's spoken "yes" runs it.
import { settings } from "./config.js";

const yesWords = (settings.confirmation?.yesWords || ["yes", "confirm"]).map((w) =>
  w.toLowerCase(),
);

export const CONFIRM_TIMEOUT_MS = (settings.confirmation?.timeoutSeconds ?? 60) * 1000;

/** True only for a clear yes. Anything with "no"/"don't"/"cancel"/"stop" in it is a no. */
export function isYes(utterance) {
  const text = ` ${String(utterance).toLowerCase().replace(/[^a-z' ]/g, " ")} `.replace(/\s+/g, " ");
  if (/ (no|nope|don't|dont|do not|cancel|stop|wait|never|abort) /.test(text)) return false;
  return yesWords.some((w) => text.includes(` ${w} `));
}
