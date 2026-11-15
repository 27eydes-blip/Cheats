// A throwaway PostgreSQL for the SQL tests: the parts of Supabase the migrations use (roles,
// auth.users, auth.uid()), the scores table as it is live, and every migration already live,
// applied in order. Each test gets its own server in a temporary folder, removed afterwards.
// Skipped where PostgreSQL isn't installed (GitHub's Ubuntu runners have it).
import { execFileSync } from "node:child_process";
import { chmodSync, chownSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const MIG = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

function pgBin() {
  const root = "/usr/lib/postgresql";
  if (!existsSync(root)) return null;
  for (const v of readdirSync(root).sort((x, y) => Number(y) - Number(x)))
    if (existsSync(join(root, v, "bin", "initdb"))) return join(root, v, "bin");
  return null;
}
export const pgAvailable = () => !!pgBin();

/** Start a server with the live schema. `upTo`: apply migrations named before this prefix. */
export function startPg({ upTo = "20261115" } = {}) {
  const bin = pgBin();
  const dir = mkdtempSync(join(tmpdir(), "gly-pg-"));
  const root = process.getuid?.() === 0; // initdb refuses to run as root: use the postgres user
  if (root) {
    chmodSync(dir, 0o777);
    const pw = Number(execFileSync("id", ["-u", "postgres"]).toString().trim());
    chownSync(dir, pw, pw);
  }
  const sh = (cmd, args) =>
    (root ? execFileSync("su", ["postgres", "-c", [cmd, ...args].map((x) => `'${x}'`).join(" ")]) : execFileSync(cmd, args)).toString();
  const port = String(56000 + Math.floor(Math.random() * 3000));
  sh(join(bin, "initdb"), ["-D", join(dir, "data"), "-A", "trust", "-U", "postgres"]);
  sh(join(bin, "pg_ctl"), ["-D", join(dir, "data"), "-o", `-p ${port} -k ${dir} -c listen_addresses=`, "-l", join(dir, "log"), "-w", "start"]);
  const psql = (sql, { file } = {}) =>
    execFileSync("psql", ["-h", dir, "-p", port, "-U", "postgres", "-d", "postgres", "-q", "-tA", "-v", "ON_ERROR_STOP=1", ...(file ? ["-f", file] : ["-c", sql])], {
      stdio: ["ignore", "pipe", "pipe"],
    })
      .toString()
      .trim();
  /** A statement as a signed-in player (the API's role and their user id); errors come back as text. */
  const asPlayer = (uid, sql, role = "authenticated") => {
    try {
      return psql(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid}', false); ${sql}`).split("\n").at(-1);
    } catch (e) {
      return `ERROR ${String(e.stderr).match(/ERROR:\s+(.*)/)?.[1]}`;
    }
  };
  const stop = () => {
    try {
      sh(join(bin, "pg_ctl"), ["-D", join(dir, "data"), "-m", "immediate", "stop"]);
    } catch {
      /* already stopped */
    }
    rmSync(dir, { recursive: true, force: true });
  };
  try {
    psql(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key, email text, is_anonymous boolean default true);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
      grant usage on schema auth to anon, authenticated;
      grant usage on schema public to anon, authenticated;
      create table public.scores (
        id bigserial primary key, player_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
        username text, level text not null, score bigint not null, run_time_ms bigint, character text,
        created_at timestamptz default now(), unique (player_id, level));
      alter table public.scores enable row level security;
      create policy "read" on public.scores for select using (true);
      create policy "ins own" on public.scores for insert to authenticated with check (player_id = auth.uid());
      create policy "upd own" on public.scores for update to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());
      grant select, insert, update on public.scores to anon, authenticated;
      grant usage on sequence public.scores_id_seq to authenticated;`);
    // every migration already live, in order (not the one-off leaderboard reset / account wipe)
    for (const f of readdirSync(MIG).sort())
      if (f < upTo && !/reset|delete_account/.test(f)) psql(null, { file: join(MIG, f) });
  } catch (e) {
    stop();
    throw new Error(`${e.message}\n${e.stderr || ""}`);
  }
  return { psql, asPlayer, stop };
}
