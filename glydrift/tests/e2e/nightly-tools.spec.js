// The nightly sweep's helpers (.github/workflows/glydrift.yml): the read-only crash digest and its
// database role (supabase/admin/nightly_readonly_role.sql), on a real Postgres. No browser needed.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { pgAvailable, startPg } from "./pg.js";
import { profileOf } from "./helpers.js";

const ROOT = join(import.meta.dirname, "..", "..");

test("nightly crash digest: a read-only role that can read crash_reports and nothing else @smoke", async ({}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser lane (no browser needed)");
  test.skip(!pgAvailable(), "PostgreSQL isn't installed here");
  test.setTimeout(120_000);
  const pg = startPg({ upTo: "20261117" });
  try {
    const sql = readFileSync(join(ROOT, "supabase/admin/nightly_readonly_role.sql"), "utf8").replace(
      "CHOOSE_A_LONG_RANDOM_PASSWORD",
      "test-only-password",
    );
    pg.psql(sql);
    pg.psql(sql); // safe to run twice
    pg.psql(`insert into public.crash_reports (kind, message, build, browser, device, created_at) values
      ('error', 'TypeError: x is null', 'abc1', 'Safari 18', 'iPhone', now() - interval '1 hour'),
      ('error', 'TypeError: x is null', 'abc1', 'Safari 18', 'iPhone', now() - interval '2 hours'),
      ('webgl', 'context lost', 'abc2', 'Chrome 140', 'Android', now() - interval '3 hours'),
      ('error', 'old one', 'abc0', 'Safari 17', 'iPad', now() - interval '3 days')`);
    const url = `postgresql://glydrift_nightly_reader:test-only-password@/postgres?host=${pg.dir}&port=${pg.port}`;
    const asReader = (q) => {
      try {
        return execFileSync("psql", [url, "-X", "-q", "-tA", "-c", q], { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
      } catch (e) {
        return `ERROR ${String(e.stderr).match(/ERROR:\s+(.*)/)?.[1]}`;
      }
    };
    // it reads crash reports...
    expect(asReader("select count(*) from public.crash_reports")).toBe("4");
    // ...and nothing else, and it can't change anything
    expect(asReader("select count(*) from public.scores")).toMatch(/^ERROR permission denied/);
    expect(asReader("select count(*) from public.player_saves")).toMatch(/^ERROR permission denied/);
    expect(asReader("delete from public.crash_reports")).toMatch(/^ERROR (permission denied|cannot execute DELETE in a read-only transaction)/);
    expect(asReader("insert into public.crash_reports (kind) values ('x')")).toMatch(/^ERROR/);
    // the digest: last 24 hours only, most common first
    const run = (env) =>
      execFileSync("bash", [join(ROOT, "scripts/crash-digest.sh")], { env: { ...process.env, ...env } }).toString();
    const digest = run({ GLYDRIFT_READONLY_DB_URL: url });
    expect(digest).toContain("### Crash reports, last 24 hours: 3");
    expect(digest).toMatch(/error \| TypeError: x is null \| 2 \| abc1/);
    expect(digest).not.toContain("old one");
    // no secret: skipped quietly; a wrong one: says so, never fails the night
    expect(run({ GLYDRIFT_READONLY_DB_URL: "" })).toContain("Crash digest skipped");
    // (the test server lets any password in, so "wrong" here is a database that is not there)
    expect(run({ GLYDRIFT_READONLY_DB_URL: url.replace("/postgres?", "/no_such_db?") })).toContain("Crash digest unavailable");
  } finally {
    pg.stop();
  }
});
