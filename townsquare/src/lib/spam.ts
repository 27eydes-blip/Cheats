import { get, now } from "./db";
import { extractLinks } from "./text";

/** Phrases that show up almost exclusively in scam posts. Keep this list small and obvious. */
const SCAM_PATTERNS = [
  /\b(double|triple) your (crypto|bitcoin|money)\b/i,
  /\bfree (crypto|bitcoin|btc|eth|usdt)\b/i,
  /\bsend .{0,20}(btc|eth|usdt|crypto).{0,20}(get|receive) .{0,10}back\b/i,
  /\b(dm|message) me to (earn|make) \$?\d+/i,
  /\bguaranteed (profit|returns)\b/i,
  /\bclaim your (prize|reward|airdrop)\b/i,
];

/**
 * Basic spam checks run before a post is saved. Returns a user-facing reason
 * when the post should be blocked, or null when it looks fine.
 */
export function spamCheck(userId: string, body: string, accountCreatedAt: number): string | null {
  const links = extractLinks(body);
  const isNew = now() - accountCreatedAt < 24 * 60 * 60_000;
  if (links.length > (isNew ? 2 : 4)) {
    return isNew ? "New accounts can include up to 2 links per post." : "Posts can include up to 4 links.";
  }
  if (SCAM_PATTERNS.some((re) => re.test(body))) {
    return "This post looks like a common scam, so it wasn't published. If this is a mistake, contact support.";
  }
  // Long runs of one character ("!!!!!!!!!!!!!!!!!!!!!!!!") or a word repeated over and over
  if (/(.)\1{29,}/u.test(body)) return "Please cut down the repeated characters.";
  const words = body.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.length >= 12) {
    const top = Math.max(...Object.values(words.reduce<Record<string, number>>((m, w) => ((m[w] = (m[w] ?? 0) + 1), m), {})));
    if (top / words.length > 0.6) return "Please cut down the repeated words.";
  }
  // The same text posted again within an hour
  if (body.length >= 20) {
    const dup = get(
      "SELECT 1 FROM posts WHERE author_id = ? AND body = ? AND created_at > ? AND deleted_at IS NULL LIMIT 1",
      [userId, body, now() - 60 * 60_000],
    );
    if (dup) return "You already posted that recently.";
  }
  return null;
}
