import { z } from "zod";
import { AppError } from "./errors";
import { all, get, newId, now, run, tx } from "./db";
import { hashPassword, randomToken, sha256, verifyPassword } from "./passwords";
import { handleSchema, profileSchema, signupSchema } from "./validate";

export type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  google_sub: string | null;
  handle: string;
  display_name: string;
  bio: string;
  avatar_media_id: string | null;
  banner_media_id: string | null;
  links: string;
  pinned_post_id: string | null;
  role: "user" | "admin";
  status: "active" | "suspended" | "deleted";
  suspended_until: number | null;
  verified: number;
  hide_follows: number;
  is_premium: number;
  town: string | null;
  interests: string;
  onboarded: number;
  created_at: number;
};

/** The small, public slice of a user shown next to posts. */
export type UserMini = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  verified: boolean;
  /** Hosting something on Live right now. */
  live?: boolean;
};

export type ProfileView = UserMini & {
  bio: string;
  bannerUrl: string | null;
  links: { label: string; url: string }[];
  pinnedPostId: string | null;
  joinedAt: number;
  followers: number | null; // null when hidden
  following: number | null;
  postCount: number;
  status: UserRow["status"];
  viewer: { isSelf: boolean; follows: boolean; followsYou: boolean; blocked: boolean; muted: boolean; blockedBy: boolean };
};

export const mediaUrl = (id: string | null) => (id ? `/api/media/${id}` : null);

export function toMini(u: Pick<UserRow, "id" | "handle" | "display_name" | "avatar_media_id" | "verified">): UserMini {
  return { id: u.id, handle: u.handle, displayName: u.display_name, avatarUrl: mediaUrl(u.avatar_media_id), verified: !!u.verified };
}

export function userById(id: string) {
  return get<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
}

export function userByHandle(handle: string) {
  return get<UserRow>("SELECT * FROM users WHERE handle = ? AND status != 'deleted'", [handle]);
}

function adminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function createUser(input: z.input<typeof signupSchema>): Promise<UserRow> {
  const data = signupSchema.parse(input);
  if (get("SELECT 1 FROM users WHERE email = ?", [data.email])) throw new AppError("An account with that email already exists.");
  if (get("SELECT 1 FROM users WHERE handle = ?", [data.handle])) throw new AppError("That handle is taken.");
  const hash = await hashPassword(data.password);
  const id = newId();
  run(
    `INSERT INTO users (id, email, password_hash, handle, display_name, role, onboarded, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [id, data.email, hash, data.handle, data.displayName, adminEmails().includes(data.email) ? "admin" : "user", now()],
  );
  return userById(id)!;
}

export async function authenticate(email: string, password: string): Promise<UserRow> {
  const u = get<UserRow>("SELECT * FROM users WHERE email = ? AND status != 'deleted'", [email.trim().toLowerCase()]);
  const ok = await verifyPassword(password, u?.password_hash);
  if (!u || !ok) throw new AppError("Wrong email or password.");
  return u;
}

/** Find or create the account for a verified Google identity. */
export function upsertGoogleUser(p: { sub: string; email: string; name: string }): UserRow {
  return tx(() => {
    const bySub = get<UserRow>("SELECT * FROM users WHERE google_sub = ?", [p.sub]);
    if (bySub) return bySub;
    const byEmail = get<UserRow>("SELECT * FROM users WHERE email = ?", [p.email.toLowerCase()]);
    if (byEmail) {
      // Google verified this email address, so linking is safe.
      run("UPDATE users SET google_sub = ? WHERE id = ?", [p.sub, byEmail.id]);
      return userById(byEmail.id)!;
    }
    const base = (p.email.split("@")[0] || "user").replace(/[^A-Za-z0-9_]/g, "").slice(0, 14) || "user";
    let handle = base.length >= 3 ? base : `${base}user`;
    while (get("SELECT 1 FROM users WHERE handle = ?", [handle]) || !handleSchema.safeParse(handle).success) {
      handle = `${base.slice(0, 12)}${Math.floor(Math.random() * 9000 + 1000)}`;
    }
    const id = newId();
    run(
      `INSERT INTO users (id, email, google_sub, handle, display_name, role, onboarded, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [id, p.email.toLowerCase(), p.sub, handle, p.name.slice(0, 50) || handle, adminEmails().includes(p.email.toLowerCase()) ? "admin" : "user", now()],
    );
    return userById(id)!;
  });
}

// ---------- sessions ----------
const SESSION_DAYS = 30;

export function createSession(userId: string): { token: string; expiresAt: number } {
  const token = randomToken();
  const expiresAt = now() + SESSION_DAYS * 86_400_000;
  run("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [sha256(token), userId, now(), expiresAt]);
  return { token, expiresAt };
}

export function userFromSession(token: string | undefined): UserRow | null {
  if (!token) return null;
  const u = get<UserRow>(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.status != 'deleted'`,
    [sha256(token), now()],
  );
  if (!u) return null;
  // Lift a timed suspension once it has run out.
  if (u.status === "suspended" && u.suspended_until && u.suspended_until < now()) {
    run("UPDATE users SET status = 'active', suspended_until = NULL WHERE id = ?", [u.id]);
    return userById(u.id)!;
  }
  return u;
}

export function destroySession(token: string) {
  run("DELETE FROM sessions WHERE token_hash = ?", [sha256(token)]);
}

// ---------- profile ----------
export function getProfile(handle: string, viewerId: string | null): ProfileView | null {
  const u = userByHandle(handle);
  if (!u) return null;
  const count = (sql: string) => get<{ n: number }>(sql, [u.id])?.n ?? 0;
  const isSelf = viewerId === u.id;
  const rel = (sql: string, a: string | null, b: string) => (a ? !!get(sql, [a, b]) : false);
  const hidden = !!u.hide_follows && !isSelf;
  return {
    ...toMini(u),
    bio: u.bio,
    bannerUrl: mediaUrl(u.banner_media_id),
    links: JSON.parse(u.links),
    pinnedPostId: u.pinned_post_id,
    joinedAt: u.created_at,
    followers: hidden ? null : count("SELECT count(*) n FROM follows WHERE followee_id = ?"),
    following: hidden ? null : count("SELECT count(*) n FROM follows WHERE follower_id = ?"),
    postCount: count("SELECT count(*) n FROM posts WHERE author_id = ? AND deleted_at IS NULL AND removed_at IS NULL"),
    status: u.status,
    viewer: {
      isSelf,
      follows: rel("SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?", viewerId, u.id),
      followsYou: viewerId ? !!get("SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?", [u.id, viewerId]) : false,
      blocked: rel("SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?", viewerId, u.id),
      blockedBy: viewerId ? !!get("SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?", [u.id, viewerId]) : false,
      muted: rel("SELECT 1 FROM mutes WHERE muter_id = ? AND muted_id = ?", viewerId, u.id),
    },
  };
}

export function updateProfile(userId: string, input: z.input<typeof profileSchema>, media?: { avatarId?: string | null; bannerId?: string | null }) {
  const p = profileSchema.parse(input);
  run("UPDATE users SET display_name = ?, bio = ?, links = ? WHERE id = ?", [
    p.displayName,
    p.bio,
    JSON.stringify(p.links.filter((l) => l.url)),
    userId,
  ]);
  if (media?.avatarId !== undefined) run("UPDATE users SET avatar_media_id = ? WHERE id = ?", [media.avatarId, userId]);
  if (media?.bannerId !== undefined) run("UPDATE users SET banner_media_id = ? WHERE id = ?", [media.bannerId, userId]);
}

export function updateAccount(userId: string, input: { handle: string; hideFollows: boolean }) {
  const handle = handleSchema.parse(input.handle);
  const taken = get<{ id: string }>("SELECT id FROM users WHERE handle = ?", [handle]);
  if (taken && taken.id !== userId) throw new AppError("That handle is taken.");
  run("UPDATE users SET handle = ?, hide_follows = ? WHERE id = ?", [handle, input.hideFollows ? 1 : 0, userId]);
}

export async function changePassword(userId: string, current: string, next: string) {
  const u = userById(userId)!;
  if (u.password_hash && !(await verifyPassword(current, u.password_hash))) throw new AppError("Current password is wrong.");
  const parsed = z.string().min(10, "New password must be at least 10 characters.").max(200).parse(next);
  run("UPDATE users SET password_hash = ? WHERE id = ?", [await hashPassword(parsed), userId]);
}

/**
 * Delete an account: personal data is erased, posts are deleted, and the
 * row is kept as a tombstone (status 'deleted') so threads don't break.
 */
export async function deleteAccount(userId: string, password: string | null) {
  const u = userById(userId);
  if (!u) return;
  if (u.password_hash && !(await verifyPassword(password ?? "", u.password_hash))) throw new AppError("Password is wrong.");
  tx(() => {
    const t = now();
    run("UPDATE posts SET deleted_at = ?, body = '', link_url = NULL, link_title = NULL WHERE author_id = ? AND deleted_at IS NULL", [t, userId]);
    for (const table of ["likes", "reposts", "bookmarks", "poll_votes", "sessions"]) run(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
    run("DELETE FROM follows WHERE follower_id = ? OR followee_id = ?", [userId, userId]);
    run("DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?", [userId, userId]);
    run("DELETE FROM mutes WHERE muter_id = ? OR muted_id = ?", [userId, userId]);
    run("DELETE FROM notifications WHERE user_id = ? OR actor_id = ?", [userId, userId]);
    run("UPDATE media SET alt = '' WHERE owner_id = ?", [userId]);
    run(
      `UPDATE users SET status = 'deleted', email = ?, password_hash = NULL, google_sub = NULL, handle = ?,
       display_name = 'Deleted account', bio = '', links = '[]', avatar_media_id = NULL, banner_media_id = NULL, pinned_post_id = NULL
       WHERE id = ?`,
      [`deleted-${userId}@invalid`, `deleted_${userId.slice(-10)}`, userId],
    );
  });
  // Files are removed from disk by the caller (media module) to keep this sync.
  return all<{ path: string }>("SELECT path FROM media WHERE owner_id = ?", [userId]);
}

/** Everything we hold about a user, for "Download my data". */
export function exportUserData(userId: string) {
  const u = userById(userId);
  if (!u) return null;
  const { password_hash: _p, google_sub: _g, ...profile } = u;
  const q = (sql: string) => all(sql, [userId]).map((r) => ({ ...(r as object) }));
  return {
    exportedAt: new Date().toISOString(),
    profile: { ...profile, links: JSON.parse(u.links), hasPassword: !!u.password_hash, googleLinked: !!u.google_sub },
    posts: q("SELECT id, body, reply_to_id, quote_of_id, link_url, created_at, edited_at, deleted_at, removed_at FROM posts WHERE author_id = ?"),
    postEdits: q("SELECT e.* FROM post_edits e JOIN posts p ON p.id = e.post_id WHERE p.author_id = ?"),
    media: q("SELECT id, post_id, mime, width, height, bytes, alt, created_at FROM media WHERE owner_id = ?"),
    following: q("SELECT u.handle, f.created_at FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ?"),
    followers: q("SELECT u.handle, f.created_at FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = ?"),
    likes: q("SELECT post_id, created_at FROM likes WHERE user_id = ?"),
    reposts: q("SELECT post_id, created_at FROM reposts WHERE user_id = ?"),
    bookmarks: q("SELECT post_id, created_at FROM bookmarks WHERE user_id = ?"),
    pollVotes: q("SELECT poll_id, option_id, created_at FROM poll_votes WHERE user_id = ?"),
    blocks: q("SELECT u.handle, b.created_at FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ?"),
    mutes: q("SELECT u.handle, m.created_at FROM mutes m JOIN users u ON u.id = m.muted_id WHERE m.muter_id = ?"),
    reportsFiled: q("SELECT target_type, target_id, reason, details, status, created_at FROM reports WHERE reporter_id = ?"),
    moderationOnYourAccount: q("SELECT action, note, created_at FROM moderation_actions WHERE target_user_id = ?"),
    notifications: q("SELECT type, post_id, message, created_at, read_at FROM notifications WHERE user_id = ?"),
  };
}

export function assertCanAct(u: UserRow) {
  if (u.status === "suspended") {
    const until = u.suspended_until ? ` until ${new Date(u.suspended_until).toLocaleDateString()}` : "";
    throw new AppError(`Your account is suspended${until}. You can still read, but not post or interact.`, "suspended");
  }
  if (u.status === "deleted") throw new AppError("This account was deleted.", "deleted");
}

export const INTERESTS = [
  "Local news", "Politics", "World", "Business", "Sports", "Tech", "Science", "Health",
  "Entertainment", "Music", "Books", "Food", "Faith", "Outdoors", "Gaming", "Cars",
] as const;

/** Save onboarding choices: interests (from the fixed list) and an optional home town for Local. */
export function saveOnboarding(userId: string, input: { interests: string[]; town: string }) {
  const interests = input.interests.filter((i): i is (typeof INTERESTS)[number] => (INTERESTS as readonly string[]).includes(i)).slice(0, 16);
  const town = input.town.replace(/[\u0000-\u001F]/g, "").trim().slice(0, 60) || null;
  run("UPDATE users SET interests = ?, town = ?, onboarded = 1 WHERE id = ?", [JSON.stringify(interests), town, userId]);
}
