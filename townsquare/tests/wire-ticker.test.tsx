// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/live", () => ({ useLiveEvents: () => {} }));

import { BREAKING_FRESH_MS, indexAfterUpdate, isBreaking, MAX_BREAKING, orderWire, relTime, ROTATE_REDUCED_MS, type WireItem } from "@/lib/wire-logic";
import { LiveWire } from "@/components/shell/LiveWire";

const NOW = Date.UTC(2026, 10, 22, 15, 0);
const MIN = 60_000;
const item = (text: string, o: Partial<WireItem> = {}): WireItem => ({ text, href: `/news/story/${text.toLowerCase().replace(/\W+/g, "-")}`, at: NOW - 10 * MIN, source: "TEST Wire", ...o });

function setReducedMotion(on: boolean) {
  window.matchMedia = ((q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}

beforeEach(() => setReducedMotion(false));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("breaking logic", () => {
  it("is breaking only for Breaking/Alert banners and live stories updated in the last 30 minutes", () => {
    expect(isBreaking({ bannerLevel: "breaking", at: NOW - 5 * 3_600_000 }, NOW)).toBe(true);
    expect(isBreaking({ bannerLevel: "alert", at: NOW }, NOW)).toBe(true);
    expect(isBreaking({ bannerLevel: "info", at: NOW }, NOW)).toBe(false);
    expect(isBreaking({ storyStatus: "live", at: NOW - 5 * MIN }, NOW)).toBe(true);
    expect(isBreaking({ storyStatus: "live", at: NOW - BREAKING_FRESH_MS - 1 }, NOW)).toBe(false);
    expect(isBreaking({ storyStatus: "developing", at: NOW }, NOW)).toBe(false);
    expect(isBreaking({ storyStatus: "ended", at: NOW }, NOW)).toBe(false);
  });

  it("puts breaking items first (newest first, at most 3), then the rest newest first, without duplicates", () => {
    const list = orderWire([
      item("Old", { at: NOW - 50 * MIN }),
      item("New", { at: NOW - 1 * MIN }),
      item("B1", { breaking: true, at: NOW - 20 * MIN }),
      item("B2", { breaking: true, at: NOW - 2 * MIN }),
      item("B3", { breaking: true, at: NOW - 3 * MIN }),
      item("B4", { breaking: true, at: NOW - 30 * MIN }),
      item("New", { at: NOW }),
      item("Banner", { href: null, label: "Breaking", at: NOW - 90 * MIN }),
    ]);
    expect(list.map((x) => x.text)).toEqual(["B2", "B3", "B1", "New", "B4", "Old", "Banner"]);
    expect(list.filter((x) => x.breaking).length).toBe(MAX_BREAKING);
  });

  it("a new breaking item takes the stage; otherwise the current headline stays", () => {
    const a = orderWire([item("A"), item("B")]);
    const withBreaking = orderWire([item("A"), item("B"), item("Big", { breaking: true })]);
    expect(indexAfterUpdate(a, withBreaking, 1)).toBe(0);
    expect(indexAfterUpdate(a, orderWire([item("Z", { at: NOW }), item("A"), item("B")]), 1)).toBe(2);
    expect(relTime(NOW - 30_000, NOW)).toBe("now");
    expect(relTime(NOW - 2 * MIN, NOW)).toBe("2m ago");
    expect(relTime(NOW - 3 * 3_600_000, NOW)).toBe("3h ago");
  });
});

describe("Latest ticker", () => {
  const items = [item("Calm headline"), item("Storm makes landfall", { breaking: true, at: NOW - 2 * MIN, source: "TEST Weather Desk" })];
  const quotes = [{ symbol: "SPY", name: "S&P 500", price: 612.28, changePct: -0.42 }, { symbol: "QQQ", name: "Nasdaq", price: 530.1, changePct: 0.31 }];

  it("shows LATEST, breaking first with its tag, outlet and time; tapping opens the story", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"], now: NOW });
    render(<LiveWire items={items} quotes={quotes} now={NOW} />);
    expect(screen.getByText("Latest")).toBeTruthy();
    const lead = screen.getByRole("link", { name: /Storm makes landfall/ });
    expect(lead.getAttribute("href")).toBe("/news/story/storm-makes-landfall");
    expect(lead.textContent).toContain("Breaking");
    expect(lead.textContent).toContain("TEST Weather Desk");
    expect(lead.textContent).toContain("2m ago");
    expect(lead.className).toContain("wire-flash");
    // Only one BREAKING tag (the calm headline has none).
    expect(document.querySelectorAll(".wire-breaking").length).toBe(1);
    // Market segment: separate, with up/down arrows.
    expect(screen.getAllByRole("link", { name: /S&P 500/ })[0].textContent).toMatch(/▼.*-0\.42%/);
    expect(screen.getAllByRole("link", { name: /NASDAQ/ })[0].textContent).toMatch(/▲.*\+0\.31%/);
  });

  it("the progress line moves to the next headline, and hover or touch pauses it", () => {
    render(<LiveWire items={items} now={NOW} />);
    const bar = () => document.querySelector(".wire-progress") as HTMLElement;
    const active = () => document.querySelector('[aria-hidden="true"].absolute') && [...document.querySelectorAll(".absolute.inset-0")].find((e) => !e.getAttribute("aria-hidden"))!.textContent;
    expect(active()).toContain("Storm makes landfall");
    fireEvent.animationEnd(bar());
    expect(active()).toContain("Calm headline");
    const zone = bar().parentElement!;
    fireEvent.mouseEnter(zone);
    expect(bar().style.animationPlayState).toBe("paused");
    fireEvent.mouseLeave(zone);
    expect(bar().style.animationPlayState).toBe("running");
    fireEvent.touchStart(zone);
    expect(bar().style.animationPlayState).toBe("paused");
  });

  it("with reduced motion: no scrolling, pulsing or progress line; a static headline that still rotates", () => {
    setReducedMotion(true);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    const { container } = render(<LiveWire items={items} quotes={quotes} now={NOW} />);
    expect(container.querySelector("[data-reduced]")).toBeTruthy();
    expect(container.querySelector(".wire-progress")).toBeNull();
    // Markets: one static row (no duplicate for looping), no marquee animation.
    expect(screen.getAllByRole("link", { name: /S&P 500/ }).length).toBe(1);
    const track = screen.getAllByRole("link", { name: /S&P 500/ })[0].closest("ul")!.parentElement!;
    expect(track.style.animation).toBe("");
    const shown = () => [...container.querySelectorAll(".absolute.inset-0")].find((e) => !e.getAttribute("aria-hidden"))!.textContent;
    expect(shown()).toContain("Storm makes landfall");
    act(() => void vi.advanceTimersByTime(ROTATE_REDUCED_MS));
    expect(shown()).toContain("Calm headline");
    // The pulsing dot and breaking flash are switched off by CSS under prefers-reduced-motion.
  });

  it("every link has a 44px tap target inside the 32px bar", () => {
    render(<LiveWire items={items} quotes={quotes} now={NOW} />);
    const links = document.querySelectorAll('[data-tap="wire"]');
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const a of links) {
      expect(a.className).toMatch(/\bh-11\b/); // 44px
      expect(a.className).toMatch(/-my-1\.5\b/); // overhangs 6px above and below, so the bar stays 32px
    }
    expect(document.querySelector(".h-\\[var\\(--wire-h\\)\\]")).toBeTruthy();
  });
});
