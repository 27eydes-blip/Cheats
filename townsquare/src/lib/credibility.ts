import { get } from "./db";

export type Credibility = {
  score: number;
  level: "Building" | "Solid" | "Trusted" | "Exemplary";
  parts: { label: string; points: number }[];
  sourced: number;
  dispatches: number;
};

/**
 * Credibility Meter (0–100). Rises with accurate sourcing: dispatches that
 * carry a source link and were not removed by moderators, sourced context
 * notes, verification and tenure. Falls when moderators remove content.
 * Transparent on purpose: the profile shows the breakdown.
 */
export function credibilityScore(userId: string): Credibility {
  const q = (sql: string) => get<{ n: number }>(sql, [userId])?.n ?? 0;
  const dispatches = q("SELECT count(*) n FROM posts WHERE author_id = ? AND reply_to_id IS NULL AND deleted_at IS NULL AND removed_at IS NULL");
  const sourced = q("SELECT count(*) n FROM posts WHERE author_id = ? AND reply_to_id IS NULL AND deleted_at IS NULL AND removed_at IS NULL AND source_url IS NOT NULL");
  const sourcedContext = q("SELECT count(*) n FROM posts WHERE author_id = ? AND stance = 'context' AND source_url IS NOT NULL AND deleted_at IS NULL AND removed_at IS NULL");
  const removed = q("SELECT count(*) n FROM posts WHERE author_id = ? AND removed_at IS NOT NULL");
  const u = get<{ verified: number; created_at: number }>("SELECT verified, created_at FROM users WHERE id = ?", [userId]);
  const months = u ? (Date.now() - u.created_at) / (30 * 86_400_000) : 0;

  // Sourcing counts in full once someone has ~10 dispatches, so one sourced post can't max it out.
  const volume = Math.min(1, dispatches / 10);
  const parts = [
    { label: "Baseline", points: 20 },
    { label: "Sourced dispatches", points: Math.round(40 * (dispatches ? sourced / dispatches : 0) * volume) },
    { label: "Sourced context notes", points: Math.min(10, sourcedContext * 2) },
    { label: "Verified", points: u?.verified ? 15 : 0 },
    { label: "Time on WorldNet", points: Math.min(10, Math.floor(months / 1.2)) },
    { label: "Removed by moderators", points: -Math.min(45, removed * 15) },
  ];
  const score = Math.max(0, Math.min(100, parts.reduce((n, p) => n + p.points, 0)));
  const level = score >= 90 ? "Exemplary" : score >= 70 ? "Trusted" : score >= 40 ? "Solid" : "Building";
  return { score, level, parts: parts.filter((p) => p.points !== 0), sourced, dispatches };
}
