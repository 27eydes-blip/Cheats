import { AppError } from "./errors";
import { get, newId, run } from "./db";
import { cleanText, safeHttpUrl } from "./text";
import type { UserRow } from "./users";

export type SponsoredCard = { id: string; sponsor: string; title: string; body: string; url: string };
export type AdsConfig = { enabled: boolean; cards: SponsoredCard[] };

/**
 * Sponsored cards in the feed. OFF by default; an admin turns them on in the
 * Control Room and adds cards. Sponsored cards are always labeled, never
 * ranked or boosted, and sit at fixed slots (4th item, then every 10th).
 */
export function getAds(): AdsConfig {
  const row = get<{ value: string }>("SELECT value FROM site_settings WHERE key = 'ads'");
  if (!row) return { enabled: false, cards: [] };
  try {
    const v = JSON.parse(row.value) as Partial<AdsConfig>;
    return { enabled: v.enabled === true, cards: Array.isArray(v.cards) ? v.cards : [] };
  } catch {
    return { enabled: false, cards: [] };
  }
}

function save(c: AdsConfig) {
  run("INSERT INTO site_settings (key, value) VALUES ('ads', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [JSON.stringify(c)]);
}
const admin = (u: UserRow) => {
  if (u.role !== "admin") throw new AppError("Admins only.", "forbidden");
};

export function setAdsEnabled(u: UserRow, on: boolean) {
  admin(u);
  save({ ...getAds(), enabled: !!on });
}

export function addSponsoredCard(u: UserRow, input: { sponsor: string; title: string; body: string; url: string }) {
  admin(u);
  const sponsor = cleanText(input.sponsor).slice(0, 40);
  const title = cleanText(input.title).slice(0, 90);
  const body = cleanText(input.body).slice(0, 200);
  const url = safeHttpUrl(String(input.url).trim().slice(0, 300));
  if (!sponsor || !title) throw new AppError("A sponsored card needs a sponsor name and a headline.");
  if (!url) throw new AppError("The link must be a full web address (https://…).");
  const c = getAds();
  if (c.cards.length >= 10) throw new AppError("Up to 10 sponsored cards. Remove one first.");
  save({ ...c, cards: [...c.cards, { id: newId(), sponsor, title, body, url }] });
}

export function removeSponsoredCard(u: UserRow, id: string) {
  admin(u);
  const c = getAds();
  save({ ...c, cards: c.cards.filter((x) => x.id !== id) });
}

/** Slots (0-based positions in the whole feed) that carry a sponsored card. */
export const isSponsoredSlot = (index: number) => index % 10 === 3;
