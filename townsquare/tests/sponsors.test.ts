import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, get, now, run } from "@/lib/db";
import { countSponsorEvent, deleteSponsor, getAds, isLive, listSponsors, processSponsorImage, saveSponsor, setAdsEnabled, sponsorImageBytes } from "@/lib/ads";
import { seedSponsors } from "@/lib/sponsors-seed";
import { freshDb, makeUser } from "./helpers";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "sponsors-"));
  process.env.UPLOAD_DIR = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(freshDb);

const admin = async () => ({ ...(await makeUser()), role: "admin" as const });
const img = (format: "png" | "jpeg" | "webp" | "gif", w = 1600, h = 900) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 30, g: 80, b: 200 } } })[format]().toBuffer();
const input = { name: "Acme", headline: "Try Acme", body: "Fine goods.", url: "https://acme.example/", button: "Shop", alt: "A blue square", startsAt: null, endsAt: null, active: true };
const files = () => readdirSync(path.join(dir, "sponsors")).filter((f) => !f.startsWith("placeholder"));

describe("upload validation", () => {
  it("accepts JPG, PNG and WebP and makes 1200×630 and 600×315 WebP versions", async () => {
    for (const f of ["png", "jpeg", "webp"] as const) {
      const out = await processSponsorImage(await img(f));
      expect(await sharp(out.w1200).metadata()).toMatchObject({ format: "webp", width: 1200, height: 630 });
      expect(await sharp(out.w600).metadata()).toMatchObject({ format: "webp", width: 600, height: 315 });
    }
  });

  it("strips metadata such as EXIF and GPS", async () => {
    const withExif = await sharp({ create: { width: 1300, height: 700, channels: 3, background: "#123456" } }).jpeg().withMetadata({ exif: { IFD0: { Copyright: "secret camera owner", Make: "PhoneCo" } } }).toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeTruthy();
    const out = await processSponsorImage(withExif);
    expect((await sharp(out.w1200).metadata()).exif).toBeUndefined();
    expect(out.w1200.includes(Buffer.from("secret camera owner"))).toBe(false);
  });

  it("rejects other file types, disguised files, oversized files and tiny images", async () => {
    await expect(processSponsorImage(await img("gif"))).rejects.toThrow(/JPG, PNG or WebP/);
    await expect(processSponsorImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).rejects.toThrow(/JPG, PNG or WebP/);
    await expect(processSponsorImage(Buffer.from("just text pretending to be photo.jpg".repeat(10)))).rejects.toThrow(/JPG, PNG or WebP/);
    const big = Buffer.concat([await img("png", 400, 300), Buffer.alloc(5 * 1024 * 1024)]);
    await expect(processSponsorImage(big)).rejects.toThrow(/5 MB/);
    await expect(processSponsorImage(await img("png", 120, 80))).rejects.toThrow(/too small/);
    const broken = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("not really a png at all")]);
    await expect(processSponsorImage(broken)).rejects.toThrow(/couldn't be read/);
  });
});

describe("sponsors", () => {
  it("saves images under UPLOAD_DIR, replaces them cleanly, and needs alt text with an image", async () => {
    const a = await admin();
    await expect(saveSponsor(a, null, { ...input, alt: "", image: await img("png") })).rejects.toThrow(/alt text/);
    const id = await saveSponsor(a, null, { ...input, image: await img("png") });
    expect(files()).toHaveLength(2);
    expect((await sharp((await sponsorImageBytes(id, 1200))!).metadata()).width).toBe(1200);
    await saveSponsor(a, id, { ...input, image: await img("jpeg") });
    expect(files()).toHaveLength(2); // old versions removed
    const card = getAds().cards.find((c) => c.id === id)!;
    expect(card).toMatchObject({ sponsor: "Acme", title: "Try Acme", button: "Shop" });
    expect(card.image!.w600).toMatch(new RegExp(`^/api/sponsors/${id}/image\\?w=600&v=`));
    await saveSponsor(a, id, { ...input, removeImage: true });
    expect(getAds().cards.find((c) => c.id === id)!.image).toBeNull(); // text-only card, never a broken image
    expect(files()).toHaveLength(0);
    deleteSponsor(a, id);
    expect(get("SELECT 1 FROM sponsors WHERE id = ?", [id])).toBeUndefined();
  });

  it("is admin-only and validates links and dates", async () => {
    const u = await makeUser();
    const a = await admin();
    await expect(saveSponsor(u, null, input)).rejects.toThrow(/Admins/);
    await expect(saveSponsor(a, null, { ...input, url: "javascript:alert(1)" })).rejects.toThrow(/web address/);
    await expect(saveSponsor(a, null, { ...input, startsAt: now() + 1000, endsAt: now() })).rejects.toThrow(/end date/);
  });

  it("shows a sponsor only when switched on and within its dates", async () => {
    const t = now();
    expect(isLive({ active: 1, starts_at: null, ends_at: null }, t)).toBe(true);
    expect(isLive({ active: 0, starts_at: null, ends_at: null }, t)).toBe(false);
    expect(isLive({ active: 1, starts_at: t + 1000, ends_at: null }, t)).toBe(false);
    expect(isLive({ active: 1, starts_at: null, ends_at: t - 1 }, t)).toBe(false);
    const a = await admin();
    const id = await saveSponsor(a, null, { ...input, startsAt: t + 86_400_000 });
    expect(getAds().cards.some((c) => c.id === id)).toBe(false);
    expect(listSponsors().find((s) => s.id === id)!.live).toBe(false);
  });

  it("counts views and clicks", async () => {
    const id = await saveSponsor(await admin(), null, input);
    countSponsorEvent(id, "view");
    countSponsorEvent(id, "view");
    countSponsorEvent(id, "click");
    expect(get("SELECT views, clicks FROM sponsors WHERE id = ?", [id])).toEqual({ views: 2, clicks: 1 });
  });

  it("the master switch still controls everything", async () => {
    const a = await admin();
    setAdsEnabled(a, true);
    expect(getAds().enabled).toBe(true);
    setAdsEnabled(a, false);
    expect(getAds().enabled).toBe(false);
  });
});

describe("migration 10", () => {
  it("adds the Glydrift sponsor with a generated placeholder image, and copies old cards once", async () => {
    const g = listSponsors().find((s) => s.name === "Glydrift")!;
    expect(g).toMatchObject({ headline: "Can you beat the Abyss???", body: "Play now at Glydrift.com", link_url: "https://glydrift.com", placeholder: "glydrift", active: 1 });
    const bytes = (await sponsorImageBytes(g.id, 600))!;
    expect(await sharp(bytes).metadata()).toMatchObject({ format: "webp", width: 600, height: 315 });
    run("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('ads', ?)", [JSON.stringify({ enabled: true, cards: [{ id: "old1", sponsor: "Old Co", title: "Old card", body: "", url: "https://old.example/" }] })]);
    seedSponsors(db());
    seedSponsors(db());
    expect(listSponsors().filter((s) => s.name === "Glydrift")).toHaveLength(1);
    expect(listSponsors().find((s) => s.id === "old1")).toMatchObject({ name: "Old Co", headline: "Old card" });
    expect(getAds().enabled).toBe(true);
  });
});
