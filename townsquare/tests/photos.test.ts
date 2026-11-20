import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { now, run } from "@/lib/db";
import { readMediaFor } from "@/lib/media";
import { listStories, setStoryPhoto } from "@/lib/news";
import { freshDb, makeUser } from "./helpers";

process.env.UPLOAD_DIR = mkdtempSync(path.join(os.tmpdir(), "ts-photos-"));
beforeEach(freshDb);

async function png() {
  const buf = await sharp({ create: { width: 64, height: 36, channels: 3, background: "#0b1f4b" } }).png().toBuffer();
  return new File([new Uint8Array(buf)], "x.png", { type: "image/png" });
}

describe("story photos", () => {
  it("editors attach a credited photo; it is public; removing restores the art", async () => {
    const t = now();
    run("INSERT INTO stories (key, title, section, status, created_at, updated_at) VALUES ('bill', 'Bill', 'Politics', 'live', ?, ?)", [t, t]);
    const reader = await makeUser();
    await expect(setStoryPhoto(reader, "bill", { file: await png(), alt: "Capitol", credit: "Staff" })).rejects.toThrow(/Editors only/);
    const admin = await makeUser();
    run("UPDATE users SET role = 'admin' WHERE id = ?", [admin.id]);
    const ed = { ...admin, role: "admin" };
    await expect(setStoryPhoto(ed, "bill", { file: await png(), alt: "", credit: "Staff" })).rejects.toThrow(/alt text/);
    await expect(setStoryPhoto(ed, "bill", { file: await png(), alt: "Capitol", credit: " " })).rejects.toThrow(/credit/);

    await setStoryPhoto(ed, "bill", { file: await png(), alt: "The Capitol at dusk", credit: "Jane Roe / Wire" });
    const s = listStories(5)[0];
    expect(s.photo).toMatchObject({ alt: "The Capitol at dusk", credit: "Jane Roe / Wire" });
    const id = s.photo!.url.split("/").pop()!;
    expect(readMediaFor(id, null)?.isPublic).toBe(true);

    await setStoryPhoto(ed, "bill", null);
    expect(listStories(5)[0].photo).toBeNull();
    expect(readMediaFor(id, null)).toBeNull();
  });
});
