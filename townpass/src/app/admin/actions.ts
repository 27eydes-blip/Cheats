"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ADMIN_COOKIE, createAdminSession, requireAdmin } from "@/lib/admin-auth";
import { getEnv } from "@/lib/env";
import { validateHours } from "@/lib/hours";
import { clientHash, rateLimit } from "@/lib/ratelimit";
import { SECTION_TYPES, sectionType } from "@/lib/sections";
import { safeEqual, stickerSuffix } from "@/lib/token";
import { validateReserveUrl } from "@/lib/reserve";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (f: FormData, k: string) => str(f, k) || null;
const err = (path: string, msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);

/* ---------------------------------- Auth ----------------------------------- */

export async function login(form: FormData) {
  const env = await getEnv();
  const who = await clientHash(await headers(), env.ACCESS_TOKEN_SECRET);
  if (!(await rateLimit(env.DB, `admin-login:${who}`, 10, 15 * 60_000))) err("/admin/login", "Too many attempts. Wait 15 minutes.");
  if (!env.ADMIN_PASSWORD || !safeEqual(str(form, "password"), env.ADMIN_PASSWORD)) err("/admin/login", "Wrong password");
  await createAdminSession(env);
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

/* --------------------------------- Cities ---------------------------------- */

function cityFields(form: FormData, path: string) {
  const price = Math.round(Number(str(form, "price")) * 100);
  if (!Number.isFinite(price) || price < 50) err(path, "Price must be at least $0.50 (Stripe minimum)");
  const mode = str(form, "access_mode");
  const hours = mode === "lifetime" ? null : Math.round(Number(str(form, "access_hours")));
  if (hours !== null && (!Number.isFinite(hours) || hours < 1)) err(path, "Access hours must be 1 or more");
  const mmdd = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  const summerStart = str(form, "summer_start");
  const summerEnd = str(form, "summer_end");
  if (!mmdd.test(summerStart) || !mmdd.test(summerEnd)) err(path, "Summer dates must be MM-DD");
  const tz = str(form, "timezone") || "America/New_York";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    err(path, `Unknown timezone "${tz}"`);
  }
  const lat = str(form, "lat") ? Number(str(form, "lat")) : null;
  const lon = str(form, "lon") ? Number(str(form, "lon")) : null;
  if ((lat !== null && !(Math.abs(lat) <= 90)) || (lon !== null && !(Math.abs(lon) <= 180)) || (lat === null) !== (lon === null)) {
    err(path, "Enter both latitude and longitude as decimal numbers (e.g. 41.0359, -71.9545)");
  }
  const code = str(form, "code").toUpperCase();
  if (!/^[A-Z]{2,5}$/.test(code)) err(path, "Code must be 2-5 letters, e.g. MTK");
  return {
    code,
    name: str(form, "name"),
    state: str(form, "state").toUpperCase().slice(0, 2),
    tagline: opt(form, "tagline"),
    timezone: tz,
    price_cents: price,
    access_hours: hours,
    summer_start: summerStart,
    summer_end: summerEnd,
    published: form.get("published") ? 1 : 0,
    lat,
    lon,
    coastal: form.get("coastal") ? 1 : 0,
    peak_label: str(form, "peak_label").slice(0, 24) || "Summer",
  };
}

export async function createCity(form: FormData) {
  const env = await requireAdmin();
  const slug = str(form, "slug").toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) err("/admin/cities", "Slug must be lowercase letters, numbers, dashes");
  const c = cityFields(form, "/admin/cities");
  const now = Date.now();
  let id: number;
  try {
    const row = await env.DB.prepare(
      `INSERT INTO cities (slug, code, name, state, tagline, timezone, price_cents, access_hours, summer_start, summer_end, published, created_at, lat, lon, coastal, peak_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
      .bind(slug, c.code, c.name, c.state, c.tagline, c.timezone, c.price_cents, c.access_hours, c.summer_start, c.summer_end, c.published, now, c.lat, c.lon, c.coastal, c.peak_label)
      .first<{ id: number }>();
    id = row!.id;
  } catch {
    return err("/admin/cities", "Slug or code already in use");
  }
  // Every new city starts with the standard sections.
  await env.DB.batch(
    SECTION_TYPES.map((t, i) =>
      env.DB.prepare("INSERT INTO sections (city_id, type, title, sort) VALUES (?, ?, ?, ?)").bind(id, t.type, t.defaultTitle, i * 10),
    ),
  );
  redirect(`/admin/cities/${id}`);
}

export async function updateCity(form: FormData) {
  const env = await requireAdmin();
  const id = Number(str(form, "id"));
  const path = `/admin/cities/${id}`;
  const c = cityFields(form, path);
  try {
    await env.DB.prepare(
      `UPDATE cities SET code=?, name=?, state=?, tagline=?, timezone=?, price_cents=?, access_hours=?, summer_start=?, summer_end=?, published=?,
       lat=?, lon=?, coastal=?, peak_label=? WHERE id=?`,
    )
      .bind(c.code, c.name, c.state, c.tagline, c.timezone, c.price_cents, c.access_hours, c.summer_start, c.summer_end, c.published, c.lat, c.lon, c.coastal, c.peak_label, id)
      .run();
    // Location may have changed: drop cached weather.
    await env.DB.prepare("DELETE FROM weather_cache WHERE city_id = ?").bind(id).run();
  } catch {
    err(path, "Code already in use");
  }
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}

/* -------------------------------- Sections --------------------------------- */

export async function createSection(form: FormData) {
  const env = await requireAdmin();
  const cityId = Number(str(form, "city_id"));
  const type = sectionType(str(form, "type")).type;
  const title = str(form, "title") || sectionType(type).defaultTitle;
  await env.DB.prepare(
    "INSERT INTO sections (city_id, type, title, sort) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort),0)+10 FROM sections WHERE city_id = ?))",
  )
    .bind(cityId, type, title, cityId)
    .run();
  redirect(`/admin/cities/${cityId}`);
}

export async function updateSection(form: FormData) {
  const env = await requireAdmin();
  const id = Number(str(form, "id"));
  const cityId = Number(str(form, "city_id"));
  if (str(form, "intent") === "delete") {
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM listings WHERE section_id = ?").bind(id).first<{ n: number }>();
    if ((n?.n ?? 0) > 0) err(`/admin/cities/${cityId}`, "Delete or move this section's listings first");
    await env.DB.prepare("DELETE FROM sections WHERE id = ?").bind(id).run();
  } else {
    await env.DB.prepare("UPDATE sections SET title = ?, intro = ?, sort = ? WHERE id = ?")
      .bind(str(form, "title"), opt(form, "intro"), Number(str(form, "sort")) || 0, id)
      .run();
  }
  redirect(`/admin/cities/${cityId}?saved=1`);
}

/* -------------------------------- Listings --------------------------------- */

export async function saveListing(form: FormData) {
  const env = await requireAdmin();
  const db = env.DB;
  const id = str(form, "id");
  const sectionId = Number(str(form, "section_id"));
  const section = await db.prepare("SELECT * FROM sections WHERE id = ?").bind(sectionId).first<{ id: number; city_id: number; type: string }>();
  if (!section) err("/admin", "Section not found");
  const path = id ? `/admin/listings/${id}` : `/admin/listings/new?section=${sectionId}`;
  const intent = str(form, "intent");

  if (intent === "delete" && id) {
    await db.prepare("DELETE FROM listings WHERE id = ?").bind(Number(id)).run();
    redirect(`/admin/cities/${section!.city_id}?saved=1`);
  }

  const name = str(form, "name");
  if (!name) err(path, "Name is required");
  for (const k of ["hours_default", "hours_summer", "hours_offseason"]) {
    const e = validateHours(str(form, k));
    if (e) err(path, `${k.replace("hours_", "")} hours: ${e}`);
  }
  const reserveErr = validateReserveUrl(str(form, "reserve_url"));
  if (reserveErr) err(path, reserveErr);
  const details: Record<string, string> = {};
  for (const f of sectionType(section!.type).fields) {
    const v = str(form, `detail_${f.key}`);
    if (v) details[f.key] = v;
  }
  const now = Date.now();
  const values = [
    sectionId,
    name,
    opt(form, "category"),
    opt(form, "address"),
    opt(form, "phone"),
    opt(form, "website"),
    opt(form, "hours_default"),
    opt(form, "hours_summer"),
    opt(form, "hours_offseason"),
    opt(form, "price_range"),
    JSON.stringify(details),
    opt(form, "local_tip"),
    opt(form, "body"),
    Number(str(form, "sort")) || 0,
    form.get("active") ? 1 : 0,
    now,
    opt(form, "reserve_url"),
  ];

  let listingId = Number(id);
  if (id) {
    await db
      .prepare(
        `UPDATE listings SET section_id=?, name=?, category=?, address=?, phone=?, website=?, hours_default=?, hours_summer=?,
         hours_offseason=?, price_range=?, details=?, local_tip=?, body=?, sort=?, active=?, updated_at=?, reserve_url=? WHERE id=?`,
      )
      .bind(...values, listingId)
      .run();
  } else {
    const row = await db
      .prepare(
        `INSERT INTO listings (section_id, name, category, address, phone, website, hours_default, hours_summer, hours_offseason,
         price_range, details, local_tip, body, sort, active, updated_at, reserve_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      )
      .bind(...values)
      .first<{ id: number }>();
    listingId = row!.id;
  }

  if (intent === "verify") {
    await db.prepare("UPDATE listings SET verified = 1, last_verified_at = ? WHERE id = ?").bind(now, listingId).run();
  } else if (intent === "unverify") {
    await db.prepare("UPDATE listings SET verified = 0 WHERE id = ?").bind(listingId).run();
  }
  redirect(`/admin/listings/${listingId}?saved=1`);
}

/** One-tap "still correct" from the verification queue. */
export async function markVerified(form: FormData) {
  const env = await requireAdmin();
  await env.DB.prepare("UPDATE listings SET verified = 1, last_verified_at = ? WHERE id = ?").bind(Date.now(), Number(str(form, "id"))).run();
  redirect(str(form, "back") || "/admin/verify");
}

/* -------------------------------- Stickers --------------------------------- */

export async function generateStickers(form: FormData) {
  const env = await requireAdmin();
  const cityId = Number(str(form, "city_id"));
  const count = Math.min(200, Math.max(1, Number(str(form, "count")) || 1));
  const city = await env.DB.prepare("SELECT code FROM cities WHERE id = ?").bind(cityId).first<{ code: string }>();
  if (!city) err("/admin/stickers", "Pick a city");
  const batch = str(form, "batch") || new Date().toISOString().slice(0, 10);
  const label = opt(form, "label");
  const now = Date.now();
  await env.DB.batch(
    Array.from({ length: count }, () =>
      env.DB.prepare("INSERT INTO stickers (id, city_id, label, batch, created_at) VALUES (?, ?, ?, ?, ?)").bind(
        `${city!.code}-${stickerSuffix()}`,
        cityId,
        label,
        batch,
        now,
      ),
    ),
  );
  redirect(`/admin/stickers?city=${cityId}&batch=${encodeURIComponent(batch)}`);
}

export async function updateSticker(form: FormData) {
  const env = await requireAdmin();
  await env.DB.prepare("UPDATE stickers SET label = ? WHERE id = ?").bind(opt(form, "label"), str(form, "id")).run();
  redirect(str(form, "back") || "/admin/stickers");
}

/* --------------------------------- Reports --------------------------------- */

export async function setReportStatus(form: FormData) {
  const env = await requireAdmin();
  const status = str(form, "status") === "resolved" ? "resolved" : "open";
  await env.DB.prepare("UPDATE reports SET status = ? WHERE id = ?").bind(status, Number(str(form, "id"))).run();
  redirect("/admin/reports");
}
