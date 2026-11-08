#!/usr/bin/env node
// Load test: 500 players send a score at the same moment (Part 2, test 5).
// Writes ONLY to the throwaway table `scores_loadtest` (supabase/tests/scores_loadtest.sql);
// it refuses to touch the real leaderboard. Uses the public (publishable) key, never a secret one.
// Run it by hand once that table exists:
//
//   node scripts/load-test-scores.mjs            # 500 players
//   PLAYERS=1000 node scripts/load-test-scores.mjs
//
// Prints: how many went in, how many were refused (and why), latency (median / 95th / worst),
// then reads them back and deletes them again.
import { SUPABASE } from "../src/config.js";

const TABLE = process.env.TABLE || "scores_loadtest";
const N = Number(process.env.PLAYERS || 500);
if (TABLE === "scores" || !/_loadtest$/.test(TABLE)) {
  console.error(`Refusing to write to "${TABLE}": the load test only uses a *_loadtest table.`);
  process.exit(2);
}
const base = `${SUPABASE.url}/rest/v1/${TABLE}`;
const headers = {
  apikey: SUPABASE.publishableKey,
  Authorization: `Bearer ${SUPABASE.publishableKey}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};
const runTag = `lt-${Date.now()}`;

function row(i) {
  const runTime = 20000 + Math.floor(Math.random() * 400000);
  const distance = Math.floor((runTime / 1000) * 40);
  return {
    player_id: crypto.randomUUID(),
    username: `LT${String(i).padStart(4, "0")}`,
    level: `${runTag}-endless`,
    score: distance * 3,
    distance,
    run_time_ms: runTime,
    character: "volt",
  };
}

const t0 = performance.now();
const results = await Promise.all(
  Array.from({ length: N }, async (_, i) => {
    const s = performance.now();
    try {
      const r = await fetch(base, { method: "POST", headers, body: JSON.stringify(row(i)) });
      return { ok: r.ok, status: r.status, ms: performance.now() - s, err: r.ok ? null : (await r.text()).slice(0, 120) };
    } catch (e) {
      return { ok: false, status: 0, ms: performance.now() - s, err: e.message };
    }
  }),
);
const wall = performance.now() - t0;
const ms = results.map((r) => r.ms).sort((a, b) => a - b);
const pct = (p) => Math.round(ms[Math.min(ms.length - 1, Math.floor(p * ms.length))]);
const bad = results.filter((r) => !r.ok);
const why = {};
for (const b of bad) why[`${b.status} ${b.err}`] = (why[`${b.status} ${b.err}`] || 0) + 1;
console.log(
  JSON.stringify(
    {
      players: N,
      accepted: N - bad.length,
      refused: bad.length,
      why,
      latencyMs: { median: pct(0.5), p95: pct(0.95), worst: Math.round(ms.at(-1)) },
      wallMs: Math.round(wall),
    },
    null,
    2,
  ),
);

// read back (every accepted row must be there exactly once), then clean up
const back = await fetch(`${base}?level=eq.${runTag}-endless&select=player_id`, { headers })
  .then((r) => r.json())
  .catch(() => []);
console.log(`read back: ${Array.isArray(back) ? back.length : "?"} rows`);
await fetch(`${base}?level=eq.${runTag}-endless`, { method: "DELETE", headers }).catch(() => {});
process.exit(bad.length || (Array.isArray(back) && back.length !== N - bad.length) ? 1 : 0);
