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
  seasonNow: q?.get("seasonNow") || null, // ?seasonNow=2026-12-05 — pretend it is that date
  month: q?.has("month") ? Number(q.get("month")) : null, // ?month=11 — pretend it is December
  mockiap: !!q?.has("mockiap"), // automated tests: Drift Pass+ purchases against a stand-in store
  mockcloud: !!q?.has("mockcloud"), // automated tests: accounts + cloud save against a local stand-in
  lbmock: !!q?.has("lbmock"), // automated tests / screenshots: a leaderboard with sample players
  offline: !!q?.has("offline"), // automated tests: skip the online start-up (leaderboard, remote seasons)
  // automated tests / screenshots with ?lbmock: who the mock server says is ALL MIGHTY
  // (other · me · former · none; see online/allMighty.js)
  allmighty: q?.get("allmighty") || null,
  lbreset: q?.get("lbreset") || null, // automated tests: act as if the server announced this leaderboard reset
  movenotice: !!q?.has("movenotice"), // automated tests: act as the old GitHub Pages address
  // Drift Pass+ previews (test builds only): ?pplus owns Season 1's Drift Pass+ with every
  // reward claimed; ?ppequip=trail_pp_lightning,p_s1founder equips items / titles;
  // ?ppreview=riftsovereign opens the tap-to-preview card for one reward on the home screen
  pplus: !!q?.has("pplus"),
  ppequip: q?.get("ppequip") || null,
  ppreview: q?.get("ppreview") || null,
  noaudio: !!q?.has("noaudio"), // automated tests: never start audio (keeps visuals deterministic)
  // automated tests on software GPUs: run the game logic every frame but draw only every Nth
  // frame (and whenever a test asks for a fresh picture) — drawing is what makes them slow
  renderEvery: Math.max(1, Number(q?.get("renderEvery")) || 1),
};
