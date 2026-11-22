import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { zipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { contrast } from "@/lib/sports/badge";
import { badgeLetters, circleColors, pickSource, processLogo, readLogoFile, removeUpload, saveProviderBadge, saveUpload, setLogoMode, sniffLogo, svgProblem, NEUTRAL_FILL } from "@/lib/sports/logos";
import { matchTeam, resetTeamIndex } from "@/lib/sports/games";
import { addAlias, deleteAlias, listAliases } from "@/lib/sports/aliases";
import { importLogoZip } from "@/lib/sports/logo-admin";
import { getTeam, listTeams } from "@/lib/sports/teams";
import { freshDb } from "./helpers";

process.env.UPLOAD_DIR = mkdtempSync(path.join(os.tmpdir(), "ts-logos-"));
beforeEach(() => {
  freshDb();
  resetTeamIndex();
  listTeams();
});

const img = (format: "png" | "jpeg" | "webp", color = "#336699", w = 300, h = 200) => sharp({ create: { width: w, height: h, channels: 4, background: color } })[format]().toBuffer();
const SVG = Buffer.from('<?xml version="1.0"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#c00"/></svg>');

describe("upload validation", () => {
  it("recognizes PNG, JPG, WebP and SVG by their contents, not the name", async () => {
    expect(sniffLogo(await img("png"))).toBe("png");
    expect(sniffLogo(await img("jpeg"))).toBe("jpeg");
    expect(sniffLogo(await img("webp"))).toBe("webp");
    expect(sniffLogo(SVG)).toBe("svg");
    expect(sniffLogo(Buffer.from("GIF89a....."))).toBeNull();
    expect(sniffLogo(Buffer.from("<html><svg></svg></html>"))).toBeNull();
    expect(sniffLogo(Buffer.from("just text named logo.png"))).toBeNull();
  });

  it("makes WebP files at 128 and 512 pixels, keeping transparency", async () => {
    for (const input of [await img("png"), await img("jpeg"), await img("webp"), SVG]) {
      const out = await processLogo(input);
      for (const size of [128, 512] as const) {
        const m = await sharp(out[size]).metadata();
        expect(m).toMatchObject({ format: "webp", width: size, height: size, hasAlpha: true });
      }
    }
  });

  it("refuses files over 2 MB, other formats, and unsafe SVGs", async () => {
    await expect(processLogo(Buffer.alloc(2 * 1024 * 1024 + 1, 0x89))).rejects.toThrow(/2 MB/);
    await expect(processLogo(Buffer.from("GIF89a"))).rejects.toThrow(/PNG, SVG, JPG or WebP/);
    const bad = [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="file:///etc/passwd"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="other.svg#a"/></svg>',
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://evil.example/x)"/></svg>',
    ];
    for (const b of bad) expect(svgProblem(b), b).not.toBeNull();
    await expect(processLogo(Buffer.from(bad[1]))).rejects.toThrow(/other images/);
    expect(svgProblem('<svg><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/><use href="#g"/></svg>')).toBeNull();
  });
});

describe("priority order", () => {
  it("is uploaded logo, then provider badge, then letter badge", () => {
    expect(pickSource("auto", { upload: true, tsdb: true })).toBe("upload");
    expect(pickSource("auto", { upload: false, tsdb: true })).toBe("tsdb");
    expect(pickSource("auto", { upload: false, tsdb: false })).toBe("letter");
    // A hand-picked choice wins, and falls back down the same order if it isn't there.
    expect(pickSource("tsdb", { upload: true, tsdb: true })).toBe("tsdb");
    expect(pickSource("letter", { upload: true, tsdb: true })).toBe("letter");
    expect(pickSource("tsdb", { upload: true, tsdb: false })).toBe("letter");
    expect(pickSource("upload", { upload: false, tsdb: true })).toBe("tsdb");
  });

  it("applies everywhere a team is shown, and removing an upload falls back", async () => {
    expect(getTeam("ncaaf-ala")).toMatchObject({ logoSource: "letter", logo: null });
    await saveProviderBadge("ncaaf-ala", await img("png", "#9E1B32"), "thesportsdb", { c1: "#9E1B32" });
    expect(getTeam("ncaaf-ala")).toMatchObject({ logoSource: "tsdb", logo: expect.stringContaining("k=tsdb") });
    await saveUpload("ncaaf-ala", SVG);
    expect(getTeam("ncaaf-ala")).toMatchObject({ logoSource: "upload", hasUpload: true, hasProviderLogo: true, logo: expect.stringContaining("k=upload") });
    setLogoMode("ncaaf-ala", "letter");
    expect(getTeam("ncaaf-ala")).toMatchObject({ logoSource: "letter", logo: null });
    setLogoMode("ncaaf-ala", "tsdb");
    expect(getTeam("ncaaf-ala")?.logoSource).toBe("tsdb");
    setLogoMode("ncaaf-ala", "auto");
    removeUpload("ncaaf-ala");
    expect(getTeam("ncaaf-ala")).toMatchObject({ logoSource: "tsdb", hasUpload: false });
    expect(readLogoFile("ncaaf-ala", "upload", 128)).toBeNull();
    expect(readLogoFile("ncaaf-ala", "tsdb", 512)?.type).toBe("image/webp");
  });
});

describe("team name matching", () => {
  it("finds the right college team for tricky names", () => {
    expect(matchTeam("NCAAF", "Miami (FL)")).toBe("ncaaf-mia");
    expect(matchTeam("NCAAF", "Miami (OH)")).toBe("ncaaf-moh");
    expect(matchTeam("NCAAF", "Arkansas State")).toBe("ncaaf-arst");
    expect(matchTeam("NCAAF", "Arkansas St.")).toBe("ncaaf-arst");
    expect(matchTeam("NCAAF", "Arkansas")).toBe("ncaaf-ark");
    expect(matchTeam("NCAAF", "Arkansas Razorbacks")).toBe("ncaaf-ark");
    expect(matchTeam("NCAAF", "Louisiana Tech")).toBe("ncaaf-lt");
    expect(matchTeam("NCAAF", "Louisiana Tech Bulldogs")).toBe("ncaaf-lt");
    expect(matchTeam("NCAAF", "Colorado State")).toBe("ncaaf-csu");
    expect(matchTeam("NCAAF", "Colorado")).toBe("ncaaf-colo");
    expect(matchTeam("NCAAF", "Fresno State")).toBe("ncaaf-fres");
    expect(matchTeam("NCAAF", "UTSA")).toBe("ncaaf-utsa");
    expect(matchTeam("NCAAF", "UTSA Roadrunners")).toBe("ncaaf-utsa");
    expect(matchTeam("NCAAF", "Bulldogs")).toBeNull(); // several teams use it
    expect(matchTeam("NCAAF", "Michigan")).toBe("ncaaf-mich");
    expect(matchTeam("NCAAF", "Michigan State")).toBe("ncaaf-msu");
  });

  it("uses aliases added in the Control Room, and forgets them when removed", () => {
    expect(matchTeam("NFL", "KC Chiefs")).toBeNull();
    addAlias("NFL", "KC Chiefs", "nfl-kc");
    expect(matchTeam("NFL", "KC Chiefs")).toBe("nfl-kc");
    expect(matchTeam("NFL", "kc   chiefs")).toBe("nfl-kc");
    expect(listAliases().some((a) => a.alias === "KC Chiefs" && a.teamName === "Kansas City Chiefs")).toBe(true);
    expect(() => addAlias("NBA", "KC", "nfl-kc")).toThrow(/different league/);
    deleteAlias("NFL", listAliases().find((a) => a.alias === "KC Chiefs")!.aliasNorm);
    expect(matchTeam("NFL", "KC Chiefs")).toBeNull();
  });

  it("still matches pro names and keeps cities with several teams apart", () => {
    expect(matchTeam("NBA", "LA Clippers")).toBe("nba-lac");
    expect(matchTeam("NBA", "Los Angeles Clippers")).toBe("nba-lac");
    expect(matchTeam("NFL", "Los Angeles")).toBeNull(); // Chargers and Rams
    expect(matchTeam("EPL", "Man United")).toBe("epl-mun");
    expect(matchTeam("NFL", "Kansas City Chiefs")).toBe("nfl-kc");
  });
});

describe("letter badge fallback", () => {
  it("uses 1 to 3 letters", () => {
    for (const t of listTeams()) expect(t.circle.letters, t.id).toMatch(/^[A-Z0-9&]{1,3}$/);
    expect(badgeLetters({ name: "Springfield Isotopes" })).toBe("SI");
    expect(badgeLetters({ id: "ncaaf-tamu", abbr: "TAMU", name: "Texas A&M Aggies" })).toBe("A&M");
  });

  it("is readable (at least 4.5:1) for every team and for any color", () => {
    for (const t of listTeams()) expect(contrast(t.circle.text, t.circle.fill), t.id).toBeGreaterThanOrEqual(4.5);
    for (let i = 0; i < 4096; i += 7) {
      const hex = `#${i.toString(16).padStart(3, "0").split("").map((c) => c + c).join("")}`;
      const c = circleColors(hex);
      expect(contrast(c.text, c.fill), hex).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("uses the provider's team color first, then ours, else a neutral color", async () => {
    await saveProviderBadge("nfl-kc", await img("png"), "thesportsdb", { c1: "#123456" });
    expect(getTeam("nfl-kc")?.circle.fill).toBe(circleColors("#123456").fill);
    expect(getTeam("nfl-buf")?.circle.fill).toBe(circleColors(getTeam("nfl-buf")!.primary).fill);
    expect(circleColors(null).fill).toBe(NEUTRAL_FILL);
  });
});

describe("bulk ZIP upload", () => {
  it("uploads images named by team slug and lists what didn't match", async () => {
    const zip = Buffer.from(
      zipSync({
        "logos/ncaaf-ala.png": new Uint8Array(await img("png")),
        "NFL-KC.svg": new Uint8Array(SVG),
        "ncaaf_utsa.webp": new Uint8Array(await img("webp")),
        "springfield-isotopes.png": new Uint8Array(await img("png")),
        "readme.txt": new TextEncoder().encode("hi"),
        "nba-bos.png": new TextEncoder().encode("not really a png"),
        "__MACOSX/._ncaaf-ala.png": new Uint8Array([0, 1]),
      }),
    );
    const r = await importLogoZip(zip);
    expect(r.matched.map((m) => m.team).sort()).toEqual(["Alabama Crimson Tide", "Kansas City Chiefs", "UTSA Roadrunners"]);
    expect(r.unmatched.map((m) => m.file).sort()).toEqual(["nba-bos.png", "readme.txt", "springfield-isotopes.png"]);
    expect(r.unmatched.find((m) => m.file === "nba-bos.png")?.reason).toMatch(/PNG, SVG, JPG or WebP/);
    expect(getTeam("ncaaf-utsa")?.logoSource).toBe("upload");
  });

  it("rejects something that isn't a ZIP", async () => {
    await expect(importLogoZip(Buffer.from("nope"))).rejects.toThrow(/ZIP/);
  });
});
