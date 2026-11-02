// Two-player Row Level Security check for the Glydrift leaderboard.
//   cd glydrift && npm run test:rls
// Signs in two separate anonymous players and confirms each one can only create/change its
// own row. Uses level "test-rls" so the real Endless/Daily boards are never touched.
// Only the publishable key is used — no secret/service_role key is needed or wanted.
import { createClient } from "@supabase/supabase-js";

const URL = "https://cdjcvhywrbsdryagqxqg.supabase.co";
const KEY = "sb_publishable_zZB05fEYY1eYhhmnzSuodg_QqpXF-dO";
const LEVEL = "test-rls";

const mk = () =>
  createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let failures = 0;
const check = (ok, label, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
  if (!ok) failures++;
};

async function signIn(name) {
  const sb = mk();
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw new Error(`${name} anonymous sign-in failed: ${error.message}`);
  return { sb, id: data.user.id };
}

const A = await signIn("Player A");
const B = await signIn("Player B");
console.log(`Player A = ${A.id}\nPlayer B = ${B.id}\n`);
check(A.id !== B.id, "two anonymous sign-ins get different player ids");

const row = (who, name, score) => ({
  player_id: who.id,
  username: name,
  level: LEVEL,
  score,
  character: "volt",
  run_time_ms: 60000,
  created_at: new Date().toISOString(),
});

// 1. each player writes their own row
let r = await A.sb
  .from("scores")
  .upsert(row(A, "TestPlayerA", 100), { onConflict: "player_id,level" })
  .select();
check(!r.error && r.data?.length === 1, "A can insert its own row", r.error?.message);
r = await B.sb
  .from("scores")
  .upsert(row(B, "TestPlayerB", 50), { onConflict: "player_id,level" })
  .select();
check(!r.error && r.data?.length === 1, "B can insert its own row", r.error?.message);

// 2. B tries to tamper with A's row
r = await B.sb
  .from("scores")
  .update({ score: 999999 })
  .eq("player_id", A.id)
  .eq("level", LEVEL)
  .select();
check(
  !r.error ? r.data.length === 0 : true,
  "B cannot update A's row",
  r.error?.message || `${r.data?.length ?? 0} rows changed`,
);
r = await B.sb.from("scores").update({ username: "Hacked" }).eq("player_id", A.id).select();
check(
  !r.error ? r.data.length === 0 : true,
  "B cannot rename A",
  r.error?.message || `${r.data?.length ?? 0} rows changed`,
);
r = await B.sb
  .from("scores")
  .insert(row(A, "Spoof", 777777))
  .select();
check(!!r.error, "B cannot insert a row as A", r.error?.message);
r = await B.sb
  .from("scores")
  .upsert({ ...row(A, "Spoof", 888888), level: "test-rls-2" }, { onConflict: "player_id,level" })
  .select();
check(!!r.error, "B cannot upsert a row as A", r.error?.message);

// 3. anyone can read, and A's row is unchanged
const anon = mk();
r = await anon
  .from("scores")
  .select("player_id,username,score")
  .eq("level", LEVEL)
  .in("player_id", [A.id, B.id]);
check(!r.error && r.data.length === 2, "anyone (no session) can read both rows", r.error?.message);
const aRow = r.data?.find((x) => x.player_id === A.id);
check(
  aRow?.score === 100 && aRow?.username === "TestPlayerA",
  "A's row is untouched",
  JSON.stringify(aRow),
);

// 4. A can still update its own row (new best + rename)
r = await A.sb
  .from("scores")
  .update({ score: 120, username: "TestPlayerA2", created_at: new Date().toISOString() })
  .eq("player_id", A.id)
  .eq("level", LEVEL)
  .select();
check(!r.error && r.data?.[0]?.score === 120, "A can update its own row", r.error?.message);

// 5. the unique (player_id, level) constraint keeps one row per player per level
r = await A.sb
  .from("scores")
  .insert(row(A, "TestPlayerA", 5))
  .select();
check(!!r.error, "a second row for the same player + level is rejected", r.error?.message);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed ✔");
console.log(`Test rows live under level "${LEVEL}" (invisible in the game).`);
process.exit(failures ? 1 : 0);
