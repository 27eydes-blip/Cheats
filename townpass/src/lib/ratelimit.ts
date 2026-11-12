import type { D1Database } from "@cloudflare/workers-types";
import { sha256Hex } from "./token";

/** Simple sliding-window limiter backed by D1. Returns true if allowed. */
export async function rateLimit(db: D1Database, key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE key = ? AND created_at > ?")
    .bind(key, now - windowMs)
    .first<{ n: number }>();
  if ((row?.n ?? 0) >= limit) return false;
  await db.prepare("INSERT INTO rate_limits (key, created_at) VALUES (?, ?)").bind(key, now).run();
  if (Math.random() < 0.02) {
    await db.prepare("DELETE FROM rate_limits WHERE created_at < ?").bind(now - 86_400_000).run();
  }
  return true;
}

/** Count-only check: true if `key` has fewer than `limit` hits in the window (does not record a hit). */
export async function underLimit(db: D1Database, key: string, limit: number, windowMs: number): Promise<boolean> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE key = ? AND created_at > ?")
    .bind(key, Date.now() - windowMs)
    .first<{ n: number }>();
  return (row?.n ?? 0) < limit;
}

export async function recordHit(db: D1Database, key: string): Promise<void> {
  await db.prepare("INSERT INTO rate_limits (key, created_at) VALUES (?, ?)").bind(key, Date.now()).run();
}

/** Privacy-preserving client id: salted hash of the IP, never the IP itself. */
export async function clientHash(headers: Headers, secret: string): Promise<string> {
  const ip = headers.get("cf-connecting-ip") || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return (await sha256Hex(`${secret}:${ip}`)).slice(0, 24);
}
