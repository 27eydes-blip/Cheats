import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, get, run } from "@/lib/db";
import { getAds, saveSponsor, sniffMotion, sponsorBannerBytes } from "@/lib/ads";
import { accessibleAccent, adSpacingOk, BANNER_ASPECT, bannerCopy, bannerCopyError, contrast, DEFAULT_ACCENT, focalCrop, isAdSlot, motionAllowed, parseHex } from "@/lib/banner";
import { bannerizeSponsors } from "@/lib/sponsors-seed";
import { freshDb, makeUser } from "./helpers";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "banners-"));
  process.env.UPLOAD_DIR = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(freshDb);

const admin = async () => ({ ...(await makeUser()), role: "admin" as const });
const input = { name: "TEST Sponsor", headline: "A much longer headline for the old tall card layout", body: "Body text.", url: "https://test.example/", button: "Play now", alt: "TEST art", startsAt: null, endsAt: null, active: true };
// Left half red, right half blue: lets us see which part a crop kept.
const twoTone = () => sharp({ create: { width: 1600, height: 1000, channels: 3, background: { r: 200, g: 30, b: 30 } } }).composite([{ input: { create: { width: 800, height: 1000, channels: 3, background: { r: 30, g: 60, b: 210 } } }, left: 800, top: 0 }]).png().toBuffer();

describe("headline and subtext limits", () => {
  it("allows 8 words and 40 characters, and no more", () => {
    expect(bannerCopyError("one two three four five six seven eight", "x".repeat(40))).toBeNull();
    expect(bannerCopyError("one two three four five six seven eight nine", "")).toMatch(/8 words/);
    expect(bannerCopyError("Short", "x".repeat(41))).toMatch(/40 characters/);
  });

  it("the editor's limits are enforced on save", async () => {
    const a = await admin();
    await expect(saveSponsor(a, null, { ...input, bannerHeadline: "one two three four five six seven eight nine" })).rejects.toThrow(/8 words/);
    await expect(saveSponsor(a, null, { ...input, bannerText: "y".repeat(41) })).rejects.toThrow(/40 characters/);
    const id = await saveSponsor(a, null, { ...input, bannerHeadline: "Beat the TEST Abyss", bannerText: "Play free at test.example" });
    expect(getAds().cards.find((c) => c.id === id)!.banner).toMatchObject({ headline: "Beat the TEST Abyss", text: "Play free at test.example" });
  });

  it("without banner words, the banner shortens the old headline and body", () => {
    const c = bannerCopy({ headline: "One two three four five six seven eight nine ten", body: "A body that is clearly longer than forty characters in total." });
    expect(c.headline).toBe("One two three four five six seven eight…");
    expect([...c.text].length).toBeLessThanOrEqual(40);
  });

  it("migration: existing sponsors get short banner copy, and known ones get hand-written copy", () => {
    run("INSERT INTO sponsors (id, name, headline, body, link_url, created_at, updated_at) VALUES ('g1', 'Glydrift', 'Can you beat the Abyss???', 'Play now at Glydrift.com', 'https://glydrift.com', 1, 1)");
    run("INSERT INTO sponsors (id, name, headline, body, link_url, created_at, updated_at) VALUES ('g2', 'Glydaway', 'Escape to the most amazing weekend getaways you will ever find anywhere', 'Book your trip today with great deals on every stay', 'https://example.com', 1, 1)");
    run("INSERT INTO sponsors (id, name, headline, body, link_url, banner_headline, created_at, updated_at) VALUES ('g3', 'Kept', 'x', 'y', 'https://example.com', 'Already set', 1, 1)");
    bannerizeSponsors(db());
    const row = (id: string) => get<{ banner_headline: string; banner_text: string }>("SELECT banner_headline, banner_text FROM sponsors WHERE id = ?", [id])!;
    expect(row("g1")).toEqual({ banner_headline: "Can you beat the Abyss?", banner_text: "Play free at Glydrift.com" });
    expect(bannerCopyError(row("g2").banner_headline, row("g2").banner_text)).toBeNull();
    expect(row("g3").banner_headline).toBe("Already set");
  });
});

describe("focal-point cropping", () => {
  it("keeps a 16:5 window centered on the focal point, inside the image", () => {
    expect(focalCrop(1200, 630, BANNER_ASPECT, 0.5, 0.5)).toEqual({ left: 0, top: 128, width: 1200, height: 375 });
    expect(focalCrop(1200, 630, BANNER_ASPECT, 0.5, 0)).toMatchObject({ top: 0 });
    expect(focalCrop(1200, 630, BANNER_ASPECT, 0.5, 1)).toMatchObject({ top: 255 });
    expect(focalCrop(3200, 500, BANNER_ASPECT, 1, 0.5)).toEqual({ left: 1600, top: 0, width: 1600, height: 500 }); // very wide: crops sideways
    expect(focalCrop(1200, 630, BANNER_ASPECT, 9, -3)).toMatchObject({ top: 0, left: 0 });
  });

  it("the stored banner follows the focal point and is 800×250 / 1600×500", async () => {
    const a = await admin();
    const wide = async (fx: number) => {
      // A 4:1 image: a 16:5 window can slide left and right.
      const src = await sharp({ create: { width: 3200, height: 800, channels: 3, background: { r: 200, g: 30, b: 30 } } }).composite([{ input: { create: { width: 1600, height: 800, channels: 3, background: { r: 30, g: 60, b: 210 } } }, left: 1600, top: 0 }]).png().toBuffer();
      const id = await saveSponsor(a, null, { ...input, image: src, focalX: fx, focalY: 0.5 });
      const out = (await sponsorBannerBytes(id, 800))!;
      const meta = await sharp(out).metadata();
      expect([meta.width, meta.height]).toEqual([800, 250]);
      const { dominant } = await sharp(out).stats();
      return dominant;
    };
    expect((await wide(0)).r).toBeGreaterThan(150); // left focus: red side
    expect((await wide(1)).b).toBeGreaterThan(150); // right focus: blue side
    const id = await saveSponsor(a, null, { ...input, image: await twoTone() });
    const big = await sharp((await sponsorBannerBytes(id, 1600))!).metadata();
    expect([big.width, big.height]).toEqual([1600, 500]);
    expect(get<{ accent: string }>("SELECT accent FROM sponsors WHERE id = ?", [id])!.accent).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("brand color", () => {
  it("borrows the image's color but always keeps white button text at AA", () => {
    for (const c of ["#ffcc00", "#00ff88", "#ff3366", "#66ccff", "#ffffff", "#8a2be2"]) {
      const a = accessibleAccent(c);
      expect(contrast(parseHex(a)!, [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
    }
    expect(accessibleAccent("#7a7a7a")).toBe(DEFAULT_ACCENT); // gray: no brand color to borrow
    expect(accessibleAccent(null)).toBe(DEFAULT_ACCENT);
  });
});

describe("motion", () => {
  it("accepts only a muted MP4 or animated WebP under 2 MB; motion is off for reduced motion, data saver and slow connections", async () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(40)]);
    const animWebp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8X"), Buffer.alloc(14), Buffer.from("ANIM"), Buffer.alloc(20)]);
    const stillWebp = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).webp().toBuffer();
    expect(sniffMotion(mp4)).toBe("video/mp4");
    expect(sniffMotion(animWebp)).toBe("image/webp");
    expect(sniffMotion(stillWebp)).toBeNull();
    const a = await admin();
    await expect(saveSponsor(a, null, { ...input, motion: stillWebp })).rejects.toThrow(/MP4 or an animated WebP/);
    await expect(saveSponsor(a, null, { ...input, motion: Buffer.concat([mp4, Buffer.alloc(2 * 1024 * 1024)]) })).rejects.toThrow(/under 2 MB/);
    const id = await saveSponsor(a, null, { ...input, motion: mp4 });
    expect(getAds().cards.find((c) => c.id === id)!.banner!.motion).toMatchObject({ type: "video/mp4" });
    expect(motionAllowed({ reducedMotion: false })).toBe(true);
    expect(motionAllowed({ reducedMotion: true })).toBe(false);
    expect(motionAllowed({ reducedMotion: false, saveData: true })).toBe(false);
    expect(motionAllowed({ reducedMotion: false, effectiveType: "2g" })).toBe(false);
    expect(motionAllowed({ reducedMotion: false, effectiveType: "4g" })).toBe(true);
  });
});

describe("ad frequency", () => {
  it("never in the first two feed items, and at most one per 8", () => {
    const kinds = Array.from({ length: 200 }, (_, i) => (isAdSlot(i) ? "ad" : "item") as "ad" | "item");
    expect(kinds.slice(0, 3)).toEqual(["item", "item", "item"]);
    expect(adSpacingOk(kinds)).toBe(true);
    expect(adSpacingOk(["item", "ad", "item"])).toBe(false);
    expect(adSpacingOk(["item", "item", "ad", "item", "item", "ad"])).toBe(false);
    for (let i = 0; i < 192; i++) expect(kinds.slice(i, i + 8).filter((k) => k === "ad").length).toBeLessThanOrEqual(1);
  });
});
