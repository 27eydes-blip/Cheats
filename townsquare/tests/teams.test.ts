import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { now, run } from "@/lib/db";
import { listStories } from "@/lib/news";
import { badgeColors, contrast } from "@/lib/sports/badge";
import { fetchProviderLogo, logoProvider, needsFetch, readLogo, TheSportsDBLogos, type LogoProvider } from "@/lib/sports/logo-provider";
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

describe("provider badges", () => {
  it("is off when switched off, and the site falls back to letter badges", () => {
    process.env.SPORTS_LOGO_PROVIDER = "manifest"; // no key or feed set
    expect(logoProvider()).toBeNull();
    expect(getTeam("nfl-kc")).toMatchObject({ logo: null, logoSource: "letter" });
  });

  it("fetches each badge once, caches it as WebP, and keeps serving it when the provider is down", async () => {
    listTeams();
    const buf = await png();
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (calls++, new Response(new Uint8Array(buf), { status: 200 }))));
    const provider: LogoProvider = { name: "test", label: "Test", headers: () => ({}), teamArt: async (t) => ({ url: t.id === "nfl-kc" ? "https://logos.example/kc.png" : null }) };
    expect(await fetchProviderLogo(getTeam("nfl-kc")!, { provider })).toBe("ok");
    expect(await fetchProviderLogo(getTeam("nfl-kc")!, { provider })).toBe("skipped"); // cached: provider not called again
    expect(calls).toBe(1);
    expect(getTeam("nfl-kc")).toMatchObject({ logoSource: "tsdb", logo: expect.stringMatching(/^\/api\/team-logo\/nfl-kc\?k=tsdb/) });
    expect(readLogo("nfl-kc")?.subarray(8, 12).toString()).toBe("WEBP");
    expect(await fetchProviderLogo(getTeam("nfl-buf")!, { provider })).toBe("missing");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await fetchProviderLogo(getTeam("nfl-kc")!, { provider, force: true })).toBe("error");
    expect(getTeam("nfl-kc")?.logoSource).toBe("tsdb"); // the cached badge still serves
  });
});

describe("TheSportsDB team badges", () => {
  const teamsJson = { teams: [
    { strTeam: "Kansas City Chiefs", strBadge: "http://r2.example/badges/kc.png", strColour1: "#E31837", strColour2: "#FFB81C" },
    { strTeam: "Buffalo Bills", strBadge: "https://r2.example/badges/buf.png" },
    { strTeam: "Nowhere Nomads", strBadge: "https://r2.example/badges/x.png" },
    { strTeam: "Dallas Cowboys", strBadge: null, strColour1: "#003594" },
  ] };

  it("matches the league's teams by name, uses HTTPS badge URLs, and reads team colors", async () => {
    listTeams();
    const urls: string[] = [];
    const p = new TheSportsDBLogos((async (u: string) => (urls.push(u), new Response(JSON.stringify(teamsJson)))) as typeof fetch);
    expect(await p.teamArt(getTeam("nfl-kc")!)).toEqual({ url: "https://r2.example/badges/kc.png", color1: "#E31837", color2: "#FFB81C" });
    expect((await p.teamArt(getTeam("nfl-buf")!)).url).toBe("https://r2.example/badges/buf.png");
    expect(await p.teamArt(getTeam("nfl-dal")!)).toMatchObject({ url: null, color1: "#003594" });
    expect(urls).toHaveLength(1); // one request per league
    expect(urls[0]).toMatch(/lookup_all_teams\.php\?id=4391$/);
  });

  it("tries the league again after a failed lookup", async () => {
    listTeams();
    let calls = 0;
    const p = new TheSportsDBLogos((async () => (++calls === 1 ? new Response("", { status: 500 }) : new Response(JSON.stringify(teamsJson)))) as typeof fetch);
    await expect(p.teamArt(getTeam("nfl-kc")!)).rejects.toThrow();
    expect((await p.teamArt(getTeam("nfl-kc")!)).url).toBe("https://r2.example/badges/kc.png");
  });

  it("is the default provider outside tests, and can be switched off", () => {
    process.env.SPORTS_LOGO_PROVIDER = "thesportsdb";
    expect(logoProvider()?.name).toBe("thesportsdb");
    process.env.SPORTS_LOGO_PROVIDER = "none";
    expect(logoProvider()).toBeNull();
  });

  it("retries misses and errors after a day", () => {
    const t = Date.now();
    expect(needsFetch("none", null, t)).toBe(true);
    expect(needsFetch("missing", t - 3_600_000, t)).toBe(false);
    expect(needsFetch("error", t - 25 * 3_600_000, t)).toBe(true);
    expect(needsFetch("ok", 0, t)).toBe(false);
  });
});
