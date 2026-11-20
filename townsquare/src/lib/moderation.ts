import { z } from "zod";
import { AppError } from "./errors";
import { all, get, newId, now, run, tx } from "./db";
import { notify } from "./notifications";
import { getPostView, type PostView } from "./posts";
import { rateLimit } from "./ratelimit";
import { toMini, userById, type UserMini, type UserRow } from "./users";
import { REPORT_REASONS, reportSchema } from "./validate";

export function fileReport(reporter: UserRow, input: z.input<typeof reportSchema>) {
  const r = reportSchema.parse(input);
  if (r.targetType === "post" && !get("SELECT 1 FROM posts WHERE id = ?", [r.targetId])) throw new AppError("Post not found.", "not_found");
  if (r.targetType === "user" && !userById(r.targetId)) throw new AppError("Account not found.", "not_found");
  if (r.targetType === "user" && r.targetId === reporter.id) throw new AppError("You can't report yourself.");
  // One open report per person per target is enough.
  if (get("SELECT 1 FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'open'", [reporter.id, r.targetType, r.targetId])) {
    return;
  }
  rateLimit("report", reporter.id);
  run("INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    newId(),
    reporter.id,
    r.targetType,
    r.targetId,
    r.reason,
    r.details,
    now(),
  ]);
}

export type ReportGroup = {
  targetType: "post" | "user";
  targetId: string;
  reasons: { reason: string; label: string; count: number }[];
  details: string[];
  count: number;
  firstAt: number;
  reportIds: string[];
  post: PostView | null;
  user: (UserMini & { status: string; strikes: number }) | null;
};

const PRIORITY = ["sexual_minor", "threat", "doxxing", "self_harm", "illegal"];

/** Open reports grouped by target. Child-safety and threat reports sort first. */
export function reportQueue(adminId: string): ReportGroup[] {
  const rows = all<{ id: string; target_type: "post" | "user"; target_id: string; reason: string; details: string; created_at: number }>(
    "SELECT id, target_type, target_id, reason, details, created_at FROM reports WHERE status = 'open' ORDER BY created_at",
  );
  const groups = new Map<string, ReportGroup>();
  for (const r of rows) {
    const key = `${r.target_type}:${r.target_id}`;
    let g = groups.get(key);
    if (!g) {
      const post = r.target_type === "post" ? getPostView(r.target_id, adminId) : null;
      // Admins need to see removed/deleted bodies to judge them.
      if (post && post.gone) {
        const raw = get<{ body: string }>("SELECT body FROM posts WHERE id = ?", [r.target_id]);
        post.body = raw?.body ?? "";
      }
      const uid = r.target_type === "user" ? r.target_id : (get<{ author_id: string }>("SELECT author_id FROM posts WHERE id = ?", [r.target_id])?.author_id ?? "");
      const u = userById(uid);
      g = {
        targetType: r.target_type,
        targetId: r.target_id,
        reasons: [],
        details: [],
        count: 0,
        firstAt: r.created_at,
        reportIds: [],
        post,
        user: u ? { ...toMini(u), status: u.status, strikes: strikes(u.id) } : null,
      };
      groups.set(key, g);
    }
    g.count++;
    g.reportIds.push(r.id);
    if (r.details) g.details.push(r.details);
    const existing = g.reasons.find((x) => x.reason === r.reason);
    if (existing) existing.count++;
    else g.reasons.push({ reason: r.reason, label: REPORT_REASONS[r.reason as keyof typeof REPORT_REASONS] ?? r.reason, count: 1 });
  }
  const pri = (g: ReportGroup) => (g.reasons.some((r) => PRIORITY.includes(r.reason)) ? 0 : 1);
  return [...groups.values()].sort((a, b) => pri(a) - pri(b) || b.count - a.count || a.firstAt - b.firstAt);
}

export function strikes(userId: string) {
  return get<{ n: number }>("SELECT count(*) n FROM moderation_actions WHERE target_user_id = ? AND action IN ('warn','suspend','remove')", [userId])?.n ?? 0;
}

export type ModAction = "remove" | "warn" | "suspend" | "dismiss" | "unsuspend" | "restore";

/**
 * Apply a moderator decision to a reported target and close its reports.
 * suspendDays: 0 = permanent (ban).
 */
export function moderate(admin: UserRow, p: { targetType: "post" | "user"; targetId: string; action: ModAction; note?: string; suspendDays?: number }) {
  if (admin.role !== "admin") throw new AppError("Admins only.", "forbidden");
  const note = (p.note ?? "").slice(0, 500);
  tx(() => {
    const t = now();
    const postAuthor = p.targetType === "post" ? get<{ author_id: string }>("SELECT author_id FROM posts WHERE id = ?", [p.targetId])?.author_id : null;
    const userId = p.targetType === "user" ? p.targetId : postAuthor;
    if (!userId) throw new AppError("Target not found.", "not_found");
    if (userId === admin.id && p.action !== "dismiss") throw new AppError("You can't moderate your own account.");
    const log = (action: string) =>
      run("INSERT INTO moderation_actions (id, moderator_id, target_user_id, target_post_id, action, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
        newId(), admin.id, userId, p.targetType === "post" ? p.targetId : null, action, note, t,
      ]);

    switch (p.action) {
      case "remove":
        if (p.targetType !== "post") throw new AppError("Only posts can be removed.");
        run("UPDATE posts SET removed_at = ? WHERE id = ?", [t, p.targetId]);
        run("DELETE FROM post_hashtags WHERE post_id = ?", [p.targetId]);
        notify(userId, null, "warning", p.targetId, `A post of yours was removed for breaking the Community Guidelines.${note ? ` Note: ${note}` : ""} You can appeal from Settings → Account.`);
        log("remove");
        break;
      case "restore":
        run("UPDATE posts SET removed_at = NULL WHERE id = ?", [p.targetId]);
        log("restore");
        break;
      case "warn":
        notify(userId, null, "warning", p.targetType === "post" ? p.targetId : null, `Warning from the moderation team: please follow the Community Guidelines.${note ? ` Note: ${note}` : ""}`);
        log("warn");
        break;
      case "suspend": {
        const days = Math.max(0, Math.min(365, p.suspendDays ?? 7));
        const until = days ? t + days * 86_400_000 : null;
        run("UPDATE users SET status = 'suspended', suspended_until = ? WHERE id = ?", [until, userId]);
        notify(userId, null, "warning", null, days ? `Your account is suspended for ${days} day${days > 1 ? "s" : ""}.${note ? ` Reason: ${note}` : ""}` : `Your account is suspended indefinitely.${note ? ` Reason: ${note}` : ""}`);
        log(days ? "suspend" : "ban");
        break;
      }
      case "unsuspend":
        run("UPDATE users SET status = 'active', suspended_until = NULL WHERE id = ?", [userId]);
        log("unsuspend");
        break;
      case "dismiss":
        log("dismiss");
        break;
    }
    run(
      "UPDATE reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE target_type = ? AND target_id = ? AND status = 'open'",
      [p.action === "dismiss" ? "dismissed" : "actioned", admin.id, t, p.targetType, p.targetId],
    );
  });
}

export function recentActions(limit = 30) {
  return all<{ id: string; action: string; note: string; created_at: number; mod_handle: string | null; user_handle: string | null; target_post_id: string | null }>(
    `SELECT a.id, a.action, a.note, a.created_at, a.target_post_id, m.handle mod_handle, u.handle user_handle
     FROM moderation_actions a LEFT JOIN users m ON m.id = a.moderator_id LEFT JOIN users u ON u.id = a.target_user_id
     ORDER BY a.created_at DESC LIMIT ?`,
    [limit],
  ).map((r) => ({ ...r }));
}

export function siteStats() {
  const n = (sql: string, p: (string | number)[] = []) => get<{ n: number }>(sql, p)?.n ?? 0;
  const day = now() - 86_400_000;
  return {
    users: n("SELECT count(*) n FROM users WHERE status != 'deleted'"),
    suspended: n("SELECT count(*) n FROM users WHERE status = 'suspended'"),
    posts24h: n("SELECT count(*) n FROM posts WHERE created_at > ?", [day]),
    signups24h: n("SELECT count(*) n FROM users WHERE created_at > ?", [day]),
    openReports: n("SELECT count(*) n FROM reports WHERE status = 'open'"),
  };
}

// ---------- breaking-news banner (site setting) ----------
export type Banner = { text: string; url: string | null; level: "breaking" | "alert" | "info"; setAt: number };

export function getBanner(): Banner | null {
  const row = get<{ value: string }>("SELECT value FROM site_settings WHERE key = 'banner'");
  return row ? (JSON.parse(row.value) as Banner) : null;
}

export function setBanner(admin: UserRow, banner: Omit<Banner, "setAt"> | null) {
  if (admin.role !== "admin") throw new AppError("Admins only.", "forbidden");
  if (!banner || !banner.text.trim()) run("DELETE FROM site_settings WHERE key = 'banner'");
  else run("INSERT INTO site_settings (key, value) VALUES ('banner', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [JSON.stringify({ ...banner, text: banner.text.trim().slice(0, 140), setAt: now() })]);
}
