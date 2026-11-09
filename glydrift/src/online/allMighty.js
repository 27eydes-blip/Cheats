// Reads the ALL MIGHTY holder and history from the server (tables all_mighty and
// all_mighty_history, read-only for the app; see src/data/allMighty.js). Uses the same Supabase
// client and publishable key as the leaderboard. Never throws, never blocks a screen: offline
// (or before the migration has been run) the last cached answer stays as it is.
import { AllMighty } from "../data/allMighty.js";
import { Leaderboard } from "./leaderboard.js";
import { TEST } from "../systems/testFlags.js";

const TTL_MS = 30 * 60 * 1000; // the server re-checks once a day: no need to ask often

// ---- test builds (?lbmock): a deterministic answer, no network.
// ?allmighty=other (default) · me · former · none
//   other   NeonAce (mock-0, the mock board's #1) holds it; Kestrel (mock-4) held it before
//   me      you hold it (the mock Score board puts you at #1 to match)
//   former  NeonAce holds it; you held it before
//   none    nobody (an empty board)
export function mockAllMighty(kind = TEST.allmighty || "other") {
  if (kind === "none") return { holder: null, holderName: "", since: "", history: [] };
  if (kind === "me")
    return {
      holder: "me",
      holderName: "",
      since: "2026-11-02T00:07:00Z",
      history: ["mock-0", "me"],
    };
  return {
    holder: "mock-0",
    holderName: "NeonAce",
    since: "2026-11-03T00:07:00Z",
    history: kind === "former" ? ["me", "mock-0"] : ["mock-4", "mock-0"],
  };
}

let last = 0;
let pending = null;

/** "relation does not exist": the migration hasn't been run yet (not an error to retry). */
const missingTable = (err) =>
  ["42P01", "PGRST205", "PGRST202"].includes(err?.code) ||
  /does not exist|could not find the table/i.test(err?.message || "");

async function fetchServer() {
  const sb = await Leaderboard.session();
  const [h, list] = await Promise.all([
    sb.from("all_mighty").select("player_id,username,since").eq("id", 1).maybeSingle(),
    sb.from("all_mighty_history").select("player_id").order("first_held_at").limit(500),
  ]);
  for (const r of [h, list])
    if (r.error) {
      if (missingTable(r.error)) return { holder: null, holderName: "", since: "", history: [] };
      throw r.error;
    }
  return {
    holder: h.data?.player_id || null,
    holderName: h.data?.username || "",
    since: h.data?.since || "",
    history: (list.data || []).map((r) => r.player_id).filter(Boolean),
  };
}

/**
 * Ask the server who's ALL MIGHTY (at most every 30 minutes unless `force`). Resolves to true
 * when a fresh answer arrived, false when it kept the cached one (offline, an error).
 */
export function refreshAllMighty({ force = false } = {}) {
  if (pending) return pending;
  if (!force && last && Date.now() - last < TTL_MS) return Promise.resolve(false);
  pending = (async () => {
    try {
      if (TEST.lbmock) {
        AllMighty.apply(mockAllMighty(), "me");
      } else {
        // ?offline (tests): Leaderboard.session() refuses before any request is made
        const data = await fetchServer();
        AllMighty.apply(data, Leaderboard.userId);
      }
      last = Date.now();
      return true;
    } catch {
      return false; // offline: keep the last answer
    } finally {
      pending = null;
    }
  })();
  return pending;
}

// test builds only
if (TEST.on && typeof window !== "undefined")
  window.__glyAllMighty = { AllMighty, refresh: refreshAllMighty, mock: mockAllMighty };
