import type { D1Database } from "@cloudflare/workers-types";

export interface City {
  id: number;
  slug: string;
  code: string;
  name: string;
  state: string;
  tagline: string | null;
  timezone: string;
  price_cents: number;
  currency: string;
  access_hours: number | null;
  summer_start: string;
  summer_end: string;
  published: number;
  created_at: number;
  lat: number | null;
  lon: number | null;
  coastal: number;
  peak_label: string;
}

export interface Section {
  id: number;
  city_id: number;
  type: string;
  title: string;
  intro: string | null;
  sort: number;
}

export interface Listing {
  id: number;
  section_id: number;
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  hours_default: string | null;
  hours_summer: string | null;
  hours_offseason: string | null;
  price_range: string | null;
  details: string;
  local_tip: string | null;
  body: string | null;
  verified: number;
  last_verified_at: number | null;
  sort: number;
  active: number;
  updated_at: number;
}

export interface Purchase {
  id: string;
  city_id: number;
  sticker_id: string | null;
  status: "pending" | "paid" | "refunded" | "disputed" | "expired";
  amount_cents: number;
  currency: string;
  email: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  access_expires_at: number | null;
  created_at: number;
  paid_at: number | null;
  refunded_at: number | null;
  email_sent_at: number | null;
}

export const STALE_DAYS = 30;
export const DAY_MS = 86_400_000;

export function isStale(l: Pick<Listing, "verified" | "last_verified_at">, now = Date.now()): boolean {
  return !l.verified || !l.last_verified_at || now - l.last_verified_at > STALE_DAYS * DAY_MS;
}

export function parseDetails(l: Pick<Listing, "details">): Record<string, string> {
  try {
    const v = JSON.parse(l.details || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export async function getCityBySlug(db: D1Database, slug: string) {
  return db.prepare("SELECT * FROM cities WHERE slug = ?").bind(slug).first<City>();
}

export async function getCityById(db: D1Database, id: number) {
  return db.prepare("SELECT * FROM cities WHERE id = ?").bind(id).first<City>();
}

export interface GuideSection extends Section {
  listings: Listing[];
}

export async function getGuide(db: D1Database, cityId: number, includeInactive = false): Promise<GuideSection[]> {
  const [sections, listings] = await db.batch([
    db.prepare("SELECT * FROM sections WHERE city_id = ? ORDER BY sort, id").bind(cityId),
    db
      .prepare(
        `SELECT l.* FROM listings l JOIN sections s ON s.id = l.section_id
         WHERE s.city_id = ? ${includeInactive ? "" : "AND l.active = 1"} ORDER BY l.sort, l.id`,
      )
      .bind(cityId),
  ]);
  const bySection = new Map<number, Listing[]>();
  for (const l of listings.results as unknown as Listing[]) {
    if (!bySection.has(l.section_id)) bySection.set(l.section_id, []);
    bySection.get(l.section_id)!.push(l);
  }
  return (sections.results as unknown as Section[]).map((s) => ({ ...s, listings: bySection.get(s.id) ?? [] }));
}

export async function getPurchase(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM purchases WHERE id = ?").bind(id).first<Purchase>();
}

export async function getPurchaseBySession(db: D1Database, sessionId: string) {
  return db.prepare("SELECT * FROM purchases WHERE stripe_session_id = ?").bind(sessionId).first<Purchase>();
}

/** A purchase grants access only while paid and (if timed) unexpired. */
export function purchaseGrantsAccess(p: Purchase | null, cityId: number, now = Date.now()): boolean {
  return (
    !!p && p.status === "paid" && p.city_id === cityId && (p.access_expires_at === null || p.access_expires_at > now)
  );
}

export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function accessLabel(city: Pick<City, "access_hours">): string {
  if (city.access_hours === null || city.access_hours === undefined) return "lifetime access";
  if (city.access_hours % 24 === 0 && city.access_hours >= 48) return `${city.access_hours / 24}-day access`;
  return `${city.access_hours}-hour access`;
}
