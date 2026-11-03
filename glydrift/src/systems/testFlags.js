// Test-only URL flags (?god, ?lucky, ?dimension=prism|tidal|chrono|mirror). They exist only
// in dev and in builds made with GLY_TEST=1; a normal `npm run build` compiles them out.
/* global __TEST_FLAGS__ */
const ON = typeof __TEST_FLAGS__ !== "undefined" && __TEST_FLAGS__;
const q = ON && typeof location !== "undefined" ? new URLSearchParams(location.search) : null;

export const TEST = {
  on: !!ON,
  god: !!q?.has("god"),
  lucky: !!q?.has("lucky"),
  dimension: q?.get("dimension") || null,
  character: q?.get("character") || null, // ?character=yarms — fly as any hero
};
