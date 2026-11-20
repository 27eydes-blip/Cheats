import { all, get, now, run } from "./db";
import { notify } from "./notifications";

/** Small, friendly milestones. Awarded once each. */
export const ACHIEVEMENTS = {
  first_dispatch: { label: "First dispatch", emoji: "📰", text: "You filed your first dispatch." },
  first_reaction: { label: "First reaction", emoji: "✨", text: "You reacted for the first time." },
  first_relay: { label: "Signal boost", emoji: "📡", text: "You relayed your first dispatch." },
  first_source: { label: "On the record", emoji: "🔗", text: "Your first sourced dispatch." },
  first_follower: { label: "First follower", emoji: "🤝", text: "Someone followed you." },
  followers_10: { label: "10 followers", emoji: "🌟", text: "Ten people follow you." },
  followers_100: { label: "100 followers", emoji: "🚀", text: "A hundred followers." },
  streak_3: { label: "3-day streak", emoji: "🔥", text: "Three days in a row." },
  streak_7: { label: "7-day streak", emoji: "⚡", text: "A full week of dispatches." },
  reactions_50: { label: "Crowd pleaser", emoji: "🎉", text: "50 reactions on your dispatches." },
  sharer_10: { label: "Story spreader", emoji: "🛰️", text: "You shared or relayed 10 stories." },
} as const;
export type AchievementKey = keyof typeof ACHIEVEMENTS;
export type Earned = { key: AchievementKey; label: string; emoji: string; text: string };

const DAY = 86_400_000;
/** Local calendar day number (Eastern time, the edition's clock). */
const dayOf = (ms: number) => Math.floor((ms - 5 * 3_600_000) / DAY);

/** Consecutive days with at least one dispatch or response, ending today or yesterday. */
export function postingStreak(userId: string, t = now()): number {
  const days = new Set(
    all<{ created_at: number }>("SELECT created_at FROM posts WHERE author_id = ? AND deleted_at IS NULL AND created_at > ?", [userId, t - 400 * DAY]).map((r) => dayOf(r.created_at)),
  );
  let d = dayOf(t);
  if (!days.has(d)) d -= 1; // a streak survives until the end of today
  let n = 0;
  while (days.has(d)) (n++, d--);
  return n;
}

export function earnedAchievements(userId: string): Earned[] {
  return all<{ key: AchievementKey }>("SELECT key FROM achievements WHERE user_id = ? ORDER BY earned_at", [userId])
    .filter((r) => r.key in ACHIEVEMENTS)
    .map((r) => ({ key: r.key, ...ACHIEVEMENTS[r.key] }));
}

function award(userId: string, key: AchievementKey): Earned | null {
  if (!run("INSERT OR IGNORE INTO achievements (user_id, key, earned_at) VALUES (?, ?, ?)", [userId, key, now()]).changes) return null;
  notify(userId, null, "achievement", null, `${ACHIEVEMENTS[key].emoji} ${ACHIEVEMENTS[key].label}: ${ACHIEVEMENTS[key].text}`);
  return { key, ...ACHIEVEMENTS[key] };
}

/**
 * Check the achievements a given event could unlock and award the new ones.
 * Returns what was just earned (for the celebration animation).
 */
export function checkAchievements(userId: string, event: "post" | "react" | "relay" | "follower" | "share"): Earned[] {
  const out: (Earned | null)[] = [];
  const q = (sql: string) => get<{ n: number }>(sql, [userId])?.n ?? 0;
  if (event === "post") {
    out.push(award(userId, "first_dispatch"));
    if (q("SELECT count(*) n FROM posts WHERE author_id = ? AND source_url IS NOT NULL AND deleted_at IS NULL")) out.push(award(userId, "first_source"));
    const streak = postingStreak(userId);
    if (streak >= 3) out.push(award(userId, "streak_3"));
    if (streak >= 7) out.push(award(userId, "streak_7"));
  }
  if (event === "react") out.push(award(userId, "first_reaction"));
  if (event === "relay") out.push(award(userId, "first_relay"));
  if (event === "relay" || event === "share") {
    const shares = q("SELECT count(*) n FROM reposts WHERE user_id = ?") + q("SELECT count(*) n FROM engagement_events WHERE user_id = ? AND kind = 'share'");
    if (shares >= 10) out.push(award(userId, "sharer_10"));
  }
  if (event === "follower") {
    const f = q("SELECT count(*) n FROM follows WHERE followee_id = ?");
    if (f >= 1) out.push(award(userId, "first_follower"));
    if (f >= 10) out.push(award(userId, "followers_10"));
    if (f >= 100) out.push(award(userId, "followers_100"));
  }
  if (event === "react") {
    // the author side is checked by reactionsReceived()
  }
  return out.filter((x): x is Earned => !!x);
}

/** Authors earn "Crowd pleaser" when their dispatches pass 50 reactions. */
export function reactionsReceived(authorId: string) {
  const n = get<{ n: number }>("SELECT count(*) n FROM reactions r JOIN posts p ON p.id = r.post_id WHERE p.author_id = ?", [authorId])?.n ?? 0;
  if (n >= 50) award(authorId, "reactions_50");
}
