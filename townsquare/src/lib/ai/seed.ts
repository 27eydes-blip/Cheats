import type { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { PERSONAS } from "./personas";

/**
 * Migration 11 data step: create the ten AI newsroom accounts if they are
 * missing. Additive only; existing users, posts and settings are untouched.
 * The accounts cannot sign in (no password, an unroutable email address).
 * The global kill switch starts OFF, so nothing posts until an admin turns it on.
 */
export function seedAiAccounts(db: DatabaseSync) {
  const t = Date.now();
  for (const p of PERSONAS) {
    let user = db.prepare("SELECT id FROM users WHERE handle = ? COLLATE NOCASE").get(p.handle) as { id: string } | undefined;
    if (user && !(db.prepare("SELECT 1 FROM ai_accounts WHERE user_id = ?").get(user.id))) {
      // A person already owns this handle: never take it over.
      const own = db.prepare("SELECT is_ai FROM users WHERE id = ?").get(user.id) as { is_ai: number };
      if (!own.is_ai) continue;
    }
    if (!user) {
      const id = randomBytes(12).toString("base64url");
      db.prepare(
        `INSERT INTO users (id, email, password_hash, handle, display_name, bio, role, verified, is_ai, onboarded, created_at)
         VALUES (?, ?, NULL, ?, ?, ?, 'user', 0, 1, 1, ?)`,
      ).run(id, `${p.slug}@ai-newsroom.invalid`, p.handle, p.name, p.bio, t);
      user = { id };
    }
    db.prepare(
      `INSERT OR IGNORE INTO ai_accounts (user_id, slug, niche, style_guide, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(user.id, p.slug, p.niche, p.style, t);
  }
  db.prepare("INSERT OR IGNORE INTO site_settings (key, value) VALUES ('ai_newsroom', ?)").run(JSON.stringify({ enabled: false, approval: "auto" }));
}
