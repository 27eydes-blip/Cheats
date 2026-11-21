import webpush from "web-push";
import { all, get, newId, now, run } from "../db";
import { AppError } from "../errors";

/**
 * Web push. Keys come from Railway variables:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   (npm run push:keys makes a pair)
 *   VAPID_SUBJECT                         mailto: address or https URL the push services can contact
 *                                         (falls back to APP_URL)
 * Without them, push is simply off: the Alerts toggle explains that and nothing is sent.
 */
export function vapid() {
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  const site = process.env.APP_URL && !/localhost/.test(process.env.APP_URL) ? process.env.APP_URL : process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "";
  const subject = process.env.VAPID_SUBJECT?.trim() || (site ? (site.startsWith("http") ? site : `https://${site}`) : "");
  return pub && priv && subject ? { pub, priv, subject } : null;
}
export const pushConfigured = () => !!vapid();

export type Payload = { title: string; body: string; url: string; tag?: string };
export type SubRow = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; failures: number };
/** Sends one message; returns the HTTP status from the push service. Replaceable in tests. */
export type Transport = (sub: SubRow, payload: string) => Promise<number>;

const webpushTransport: Transport = async (sub, payload) => {
  const v = vapid();
  if (!v) return 0;
  try {
    const r = await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
      vapidDetails: { subject: v.subject, publicKey: v.pub, privateKey: v.priv },
      TTL: 6 * 3600,
      urgency: "normal",
      timeout: 10_000,
    });
    return r.statusCode;
  } catch (e) {
    return (e as { statusCode?: number }).statusCode ?? 0;
  }
};
const g = globalThis as unknown as { __pushTransport?: Transport };
export function setPushTransport(t: Transport | null) {
  g.__pushTransport = t ?? undefined;
}
const transport = () => g.__pushTransport ?? (pushConfigured() ? webpushTransport : null);

// ------------------------------------------------------------------ subscriptions

export function saveSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent = "") {
  let url: URL;
  try {
    url = new URL(sub.endpoint);
  } catch {
    throw new AppError("That subscription isn't valid.");
  }
  if (url.protocol !== "https:" || !sub.keys?.p256dh || !sub.keys?.auth || sub.keys.p256dh.length > 200 || sub.keys.auth.length > 100) throw new AppError("That subscription isn't valid.");
  if ((get<{ n: number }>("SELECT count(*) n FROM push_subscriptions WHERE user_id = ?", [userId])?.n ?? 0) >= 10 && !get("SELECT 1 FROM push_subscriptions WHERE endpoint = ?", [sub.endpoint])) {
    // Keep the 9 newest devices; the oldest one makes room.
    run("DELETE FROM push_subscriptions WHERE id = (SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY created_at LIMIT 1)", [userId]);
  }
  run(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, failures = 0`,
    [newId(), userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent.slice(0, 200), now()],
  );
  ensurePrefs(userId);
}
export function removeSubscription(userId: string, endpoint: string) {
  run("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", [userId, endpoint]);
}
export const subscriptionCount = (userId: string) => get<{ n: number }>("SELECT count(*) n FROM push_subscriptions WHERE user_id = ?", [userId])!.n;

/**
 * Send to one subscription. Push services answer 404 or 410 when a
 * subscription has expired or been revoked, and 401/403 when it was made for
 * other VAPID keys: those are deleted. Other failures (429, 5xx, network)
 * count up; after 5 in a row the subscription is dropped.
 */
export async function sendTo(sub: SubRow, p: Payload): Promise<"sent" | "removed" | "failed" | "off"> {
  const t = transport();
  if (!t) return "off";
  const status = await t(sub, JSON.stringify(p));
  if (status >= 200 && status < 300) {
    run("UPDATE push_subscriptions SET last_success_at = ?, failures = 0 WHERE id = ?", [now(), sub.id]);
    return "sent";
  }
  if ([401, 403, 404, 410].includes(status) || sub.failures + 1 >= 5) {
    run("DELETE FROM push_subscriptions WHERE id = ?", [sub.id]);
    return "removed";
  }
  run("UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ?", [sub.id]);
  return "failed";
}

// ------------------------------------------------------------------ preferences

export type AlertKind = "breaking" | "replies" | "mentions" | "follows" | "following";
export const ALERT_KINDS: { key: AlertKind; label: string; text: string }[] = [
  { key: "breaking", label: "Breaking news", text: "Major stories, at most your daily limit" },
  { key: "replies", label: "Responses and quotes", text: "When someone responds to or quotes your dispatch" },
  { key: "mentions", label: "Mentions", text: "When someone mentions you" },
  { key: "follows", label: "New followers", text: "New followers and follow requests" },
  { key: "following", label: "Teams and topics you follow", text: "Big stories on your pinned topics and teams" },
];
export type AlertPrefs = Record<AlertKind, boolean> & { quietStart: number | null; quietEnd: number | null; tz: string; breakingCap: number };

export function ensurePrefs(userId: string) {
  run("INSERT OR IGNORE INTO alert_prefs (user_id) VALUES (?)", [userId]);
}
export function getAlertPrefs(userId: string): AlertPrefs {
  const r = get<{ breaking: number; replies: number; mentions: number; follows: number; following: number; quiet_start: number | null; quiet_end: number | null; tz: string; breaking_cap: number }>("SELECT * FROM alert_prefs WHERE user_id = ?", [userId]);
  return {
    breaking: r ? !!r.breaking : true, replies: r ? !!r.replies : true, mentions: r ? !!r.mentions : true, follows: r ? !!r.follows : true, following: r ? !!r.following : true,
    quietStart: r?.quiet_start ?? null, quietEnd: r?.quiet_end ?? null, tz: r?.tz ?? "America/New_York", breakingCap: r?.breaking_cap ?? 3,
  };
}
const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};
export function setAlertPrefs(userId: string, p: Partial<AlertPrefs>) {
  ensurePrefs(userId);
  const cur = getAlertPrefs(userId);
  const n = { ...cur, ...p };
  const mins = (x: number | null) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.max(0, Math.min(1439, Math.round(x))));
  run(
    "UPDATE alert_prefs SET breaking = ?, replies = ?, mentions = ?, follows = ?, following = ?, quiet_start = ?, quiet_end = ?, tz = ?, breaking_cap = ? WHERE user_id = ?",
    [n.breaking ? 1 : 0, n.replies ? 1 : 0, n.mentions ? 1 : 0, n.follows ? 1 : 0, n.following ? 1 : 0, mins(n.quietStart), mins(n.quietEnd), validTz(n.tz) ? n.tz : cur.tz, Math.max(0, Math.min(10, Math.round(n.breakingCap))), userId],
  );
}

/** Minutes after local midnight in a time zone. */
export function localMinutes(t: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t));
  return Number(parts.find((x) => x.type === "hour")!.value) * 60 + Number(parts.find((x) => x.type === "minute")!.value);
}
/** Quiet hours may wrap midnight (22:00–07:00). */
export function inQuietHours(p: Pick<AlertPrefs, "quietStart" | "quietEnd" | "tz">, t: number) {
  if (p.quietStart === null || p.quietEnd === null || p.quietStart === p.quietEnd) return false;
  const m = localMinutes(t, p.tz);
  return p.quietStart < p.quietEnd ? m >= p.quietStart && m < p.quietEnd : m >= p.quietStart || m < p.quietEnd;
}

// ------------------------------------------------------------------ delivery

export type Skip = "no_devices" | "off" | "quiet" | "cap" | "duplicate" | "not_configured";

/**
 * Deliver one alert to every device a user has. Checks, in order: push is
 * configured, the user has devices, this alert type is on, quiet hours,
 * the daily breaking cap (rolling 24 hours), and that this exact alert
 * (kind + ref) was never sent to this user before. Alerts skipped for quiet
 * hours are dropped, not queued: news is stale by morning.
 */
export async function alertUser(userId: string, kind: AlertKind, ref: string, payload: Payload, t = now()): Promise<{ sent: number } | { skipped: Skip }> {
  if (!transport()) return { skipped: "not_configured" };
  const subs = all<SubRow>("SELECT * FROM push_subscriptions WHERE user_id = ?", [userId]);
  if (!subs.length) return { skipped: "no_devices" };
  const p = getAlertPrefs(userId);
  if (!p[kind]) return { skipped: "off" };
  if (inQuietHours(p, t)) return { skipped: "quiet" };
  if (kind === "breaking" || kind === "following") {
    const cap = kind === "breaking" ? p.breakingCap : 5;
    const used = get<{ n: number }>("SELECT count(*) n FROM alert_log WHERE user_id = ? AND kind = ? AND sent_at > ?", [userId, kind, t - 24 * 3_600_000])!.n;
    if (used >= cap) return { skipped: "cap" };
  }
  const ins = run("INSERT OR IGNORE INTO alert_log (user_id, kind, ref, sent_at) VALUES (?, ?, ?, ?)", [userId, kind, ref, t]);
  if (!ins.changes) return { skipped: "duplicate" };
  let sent = 0;
  for (const s of subs) if ((await sendTo(s, payload)) === "sent") sent++;
  return { sent };
}
