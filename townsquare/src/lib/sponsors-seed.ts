import type { DatabaseSync } from "node:sqlite";

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
