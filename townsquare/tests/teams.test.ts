import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { now, run } from "@/lib/db";
import { listStories } from "@/lib/news";
import { badgeColors, contrast } from "@/lib/sports/badge";
import { fetchProviderLogo, logoProvider, readLogo, removeLogo, setManualLogo, type LogoProvider } from "@/lib/sports/logo-provider";
import { getTeam, listTeams, searchTeams, teamsMentioned } from "@/lib/sports/teams";
import { LEAGUES, TEAM_ROWS } from "@/lib/sports/teams-data";
import { freshDb } from "./helpers";

process.env.UPLOAD_DIR = mkdtempSync(path.join(os.tmpdir(), "ts-teams-"));
beforeEach(freshDb);
afterEach(() => { vi.unstubAllGlobals(); delete process.env.SPORTS_LOGO_PROVIDER; delete process.env.SPORTS_API_KEY; delete process.env.SPORTS_LOGO_MANIFEST_URL; });

const png = () => sharp({ create: { width: 40, height: 40, channels: 4, background: "#e31837" } }).png().toBuffer();

describe("team data", () => {
  it("seeds every league with valid, unique teams", () => {
    const all = listTeams();
    const counts = Object.fromEntries(LEAGUES.map((l) => [l, all.filter((t) => t.league === l).length]));
    expect(counts).toMatchObject({ NFL: 32, NBA: 30, MLB: 30, NHL: 32, MLS: 30, EPL: 20 });
    expect(counts.NCAAF).toBeGreaterThanOrEqual(40);
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length);
    for (const t of all) {
      expect(t.primary).toMatch(/^#[0-9A-F]{6}$/i);
      expect(t.secondary).toMatch(/^#[0-9A-F]{6}$/i);
      expect(t.abbr).toMatch(/^[A-Z0-9]{2,4}$/);
    }
    expect(getTeam("nfl-kc")?.fullName).toBe("Kansas City Chiefs");
    expect(getTeam("epl-ars")?.fullName).toBe("Arsenal");
    expect(getTeam("mls-skc")?.fullName).toBe("Sporting Kansas City");
  });

  it("searches by name, city and abbreviation", () => {
    expect(searchTeams("chiefs")[0].id).toBe("nfl-kc");
    expect(searchTeams("LAL")[0].id).toBe("nba-lal");
    expect(searchTeams("x")).toEqual([]);
  });
});

describe("tagging stories with teams", () => {
  it("finds full names and unambiguous nicknames, and ignores shared nicknames", () => {
    listTeams();
    expect(teamsMentioned("The Kansas City Chiefs beat the Eagles")).toEqual(expect.arrayContaining(["nfl-kc", "nfl-phi"]));
    expect(teamsMentioned("Huskies win the national title")).toEqual(["ncaaf-wash"]);
    expect(teamsMentioned("The Tigers won again")).toEqual([]); // LSU, Clemson, Auburn, Detroit… ambiguous
    expect(teamsMentioned("Arsenal and Liverpool drew")).toEqual(expect.arrayContaining(["epl-ars", "epl-liv"]));
    expect(teamsMentioned("The Jetsons and a jetliner")).toEqual([]);
    // Outside sports, only full names count (no "senators" → Ottawa Senators).
    expect(teamsMentioned("Fourteen senators crossed party lines; the Senators fans cheered", { sports: false })).toEqual([]);
    expect(teamsMentioned("fourteen senators crossed party lines")).toEqual([]);
  });

  it("tags stories automatically and exposes teams on the story", () => {
    const t = now();
    run("INSERT INTO stories (key, title, summary, section, status, created_at, updated_at) VALUES ('g', 'Celtics edge Knicks in overtime', '', 'Sports', 'ended', ?, ?)", [t, t]);
    const s = listStories(5)[0];
    expect(s.teams.map((x) => x.id).sort()).toEqual(["nba-bos", "nba-nyk"]);
  });
});

describe("generated badges", () => {
  it("every team's badge text meets 4.5:1 against its fill", () => {
    for (const l of LEAGUES) for (const [abbr, , , primary, secondary] of TEAM_ROWS[l]) {
      const c = badgeColors(primary, secondary);
      expect(contrast(c.text, c.fill), `${l} ${abbr}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("adds a visible outline when the fill is close to the page background", () => {
    expect(badgeColors("#010101", "#6CACE4").ringDark).toMatch(/0\.55/);
    expect(badgeColors("#FFFFFF", "#000000").ringLight).toMatch(/0\.45/);
    expect(badgeColors("#E31837", "#FFB81C").ringDark).toMatch(/0\.12/);
  });
});

describe("logo provider and cache", () => {
  it("is off without a key, and the site falls back to badges", () => {
    process.env.SPORTS_LOGO_PROVIDER = "manifest";
    expect(logoProvider()).toBeNull();
    expect(getTeam("nfl-kc")?.logo).toBeNull();
  });

  it("fetches each logo once, caches it locally, and keeps working when the provider is down", async () => {
    listTeams();
    const buf = await png();
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (calls++, new Response(new Uint8Array(buf), { status: 200 }))));
    const provider: LogoProvider = { name: "test", headers: () => ({}), logoUrl: async (t) => (t.id === "nfl-kc" ? "https://logos.example/kc.png" : null) };
    expect(await fetchProviderLogo(getTeam("nfl-kc")!, { provider })).toBe("ok");
    expect(await fetchProviderLogo(getTeam("nfl-kc")!, { provider })).toBe("skipped"); // cached: provider not called again
    expect(calls).toBe(1);
    expect(getTeam("nfl-kc")?.logo).toMatch(/^\/api\/team-logo\/nfl-kc/);
    expect(readLogo("nfl-kc")?.subarray(1, 4).toString()).toBe("PNG");
    expect(await fetchProviderLogo(getTeam("nfl-buf")!, { provider })).toBe("missing");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await fetchProviderLogo(getTeam("nfl-kc")!, { provider, force: true })).toBe("error");
    expect(readLogo("nfl-kc")).not.toBeNull(); // the cached file still serves
  });

  it("manual uploads win, refuse SVG, and removing restores the badge", async () => {
    listTeams();
    await setManualLogo("epl-ars", new File([new Uint8Array(await png())], "a.png", { type: "image/png" }));
    expect(getTeam("epl-ars")?.logo).not.toBeNull();
    const provider: LogoProvider = { name: "test", headers: () => ({}), logoUrl: async () => "https://x/y.png" };
    expect(await fetchProviderLogo(getTeam("epl-ars")!, { provider, force: true })).toBe("skipped");
    await expect(setManualLogo("epl-ars", new File(['<svg onload="alert(1)"/>'], "a.svg", { type: "image/svg+xml" }))).rejects.toThrow(/PNG/);
    removeLogo("epl-ars");
    expect(getTeam("epl-ars")?.logo).toBeNull();
  });
});
