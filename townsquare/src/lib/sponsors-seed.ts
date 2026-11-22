import type { DatabaseSync } from "node:sqlite";
import { BANNER_HEADLINE_WORDS, BANNER_TEXT_CHARS, shortenChars, shortenWords } from "./banner";

/**
 * Migration 10's data step. Copies sponsored cards saved by the old Control
 * Room (site_settings "ads") into the sponsors table, and adds the Glydrift
 * sponsor with a generated placeholder graphic until a real image is uploaded.
 * Runs once; never overwrites or deletes anything.
 */
export function seedSponsors(db: DatabaseSync) {
  const t = Date.now();
  const row = db.prepare("SELECT value FROM site_settings WHERE key = 'ads'").get() as { value: string } | undefined;
  if (row) {
    try {
      const v = JSON.parse(row.value) as { cards?: { id: string; sponsor: string; title: string; body: string; url: string }[] };
      const ins = db.prepare("INSERT OR IGNORE INTO sponsors (id, name, headline, body, link_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (const c of v.cards ?? []) if (c?.id && c.url) ins.run(c.id, c.sponsor, c.title, c.body ?? "", c.url, t, t);
    } catch {
      /* a bad setting is ignored */
    }
  }
  const has = db.prepare("SELECT 1 FROM sponsors WHERE lower(name) = 'glydrift'").get();
  if (!has) {
    db.prepare(
      `INSERT INTO sponsors (id, name, headline, body, link_url, button_label, image_alt, placeholder, active, created_at, updated_at)
       VALUES ('sp-glydrift', 'Glydrift', 'Can you beat the Abyss???', 'Play now at Glydrift.com', 'https://glydrift.com', 'Play now', 'Glydrift game art: a glowing path dropping into a dark abyss', 'glydrift', 1, ?, ?)`,
    ).run(t, t);
  }
}

/** Short banner copy for the sponsors we know by name; others get a shortened version of their own headline and body. */
const KNOWN: Record<string, { headline: string; text: string }> = {
  glydrift: { headline: "Can you beat the Abyss?", text: "Play free at Glydrift.com" },
};

/**
 * Migration 15's data step: give every existing sponsor banner copy (a
 * headline of at most 8 words and a line of at most 40 characters) so it
 * shows in the new compact format. Only fills empty banner fields.
 */
export function bannerizeSponsors(db: DatabaseSync) {
  const rows = db.prepare("SELECT id, name, headline, body FROM sponsors WHERE banner_headline = ''").all() as { id: string; name: string; headline: string; body: string }[];
  const up = db.prepare("UPDATE sponsors SET banner_headline = ?, banner_text = ? WHERE id = ? AND banner_headline = ''");
  for (const r of rows) {
    const k = KNOWN[r.name.trim().toLowerCase()];
    up.run(k?.headline ?? shortenWords(r.headline, BANNER_HEADLINE_WORDS), k?.text ?? shortenChars(r.body, BANNER_TEXT_CHARS), r.id);
  }
}
