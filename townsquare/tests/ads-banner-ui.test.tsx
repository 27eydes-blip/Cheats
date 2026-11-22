// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SponsoredCard as Card } from "@/lib/ads";
import { SponsoredCard } from "@/components/feed/SponsoredBanner";

const ad: Card = {
  id: "sp-test", sponsor: "TEST Glydrift", title: "Old long headline", body: "Body", url: "https://test.example/", button: "Play now", image: null,
  banner: { headline: "Can you beat the TEST Abyss?", text: "Play free at test.example", accent: "#1f7a4d", image: { w800: "/b800.webp", w1600: "/b1600.webp", original: "/o.webp", alt: "TEST art" }, focal: { x: 0.5, y: 0.5 }, motion: { url: "/m.mp4", type: "video/mp4" } },
};

let io: ((on: boolean) => void) | null = null;
function setEnv(o: { reduced?: boolean; saveData?: boolean }) {
  window.matchMedia = ((q: string) => ({ matches: !!o.reduced && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  Object.defineProperty(navigator, "connection", { value: { saveData: !!o.saveData, effectiveType: "4g" }, configurable: true });
}
beforeEach(() => {
  setEnv({});
  localStorage.clear();
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
      io = (on) => cb([{ isIntersecting: on }]);
    }
    observe() {}
    disconnect() {}
  };
  navigator.sendBeacon = vi.fn(() => true);
});
afterEach(cleanup);
const show = () => act(() => io?.(true));

describe("sponsored banner", () => {
  it("always shows Sponsored and the sponsor's name, and is clearly an ad", () => {
    const { container } = render(<SponsoredCard ad={ad} />);
    const label = container.querySelector("[data-ad-label]")!;
    expect(label.textContent).toBe("SponsoredTEST Glydrift");
    expect(getComputedStyle(label).display).not.toBe("none");
    expect(screen.getByRole("complementary", { name: "Sponsored by TEST Glydrift" })).toBeTruthy();
    expect(screen.getByText("Can you beat the TEST Abyss?")).toBeTruthy();
  });

  it("the whole card is one link that opens in a new tab with rel=sponsored noopener; the button is 44px", () => {
    const { container } = render(<SponsoredCard ad={ad} />);
    const links = [...container.querySelectorAll("a")];
    for (const a of links) {
      expect(a.getAttribute("href")).toBe("https://test.example/");
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("sponsored noopener");
    }
    const card = screen.getByRole("link", { name: /Can you beat the TEST Abyss\?.*Play now.*opens in a new tab/ });
    expect(card.className).toContain("inset-0");
    expect(container.querySelector(".ad-cta")!.className).toMatch(/\bh-11\b/);
  });

  it("reserves its height before the image loads and lazy-loads the image", () => {
    const { container } = render(<SponsoredCard ad={ad} />);
    expect(container.querySelector(".ad-banner")!.className).toMatch(/h-\[140px\]/);
    expect(container.querySelector("img")!.getAttribute("loading")).toBe("lazy");
  });

  it("plays short motion only while visible, and never with reduced motion or data saver", () => {
    const { container, unmount } = render(<SponsoredCard ad={ad} />);
    expect(container.querySelector("video")).toBeNull(); // not visible yet
    show();
    expect(container.querySelector("video")!.muted).toBe(true);
    act(() => io?.(false));
    expect(container.querySelector("video")).toBeNull();
    unmount();
    for (const env of [{ reduced: true }, { saveData: true }]) {
      setEnv(env);
      const r = render(<SponsoredCard ad={ad} />);
      show();
      expect(r.container.querySelector("video")).toBeNull();
      expect(r.container.querySelector("img")!.getAttribute("src")).toBe("/b800.webp"); // the still frame
      r.unmount();
    }
  });

  it("starts the one-time sheen when it first scrolls into view", () => {
    const { container } = render(<SponsoredCard ad={ad} />);
    expect(container.querySelector(".ad-seen")).toBeNull();
    show();
    expect(container.querySelector(".ad-seen")).toBeTruthy();
  });

  it("Hide this ad hides it and remembers", () => {
    const { container } = render(<SponsoredCard ad={ad} />);
    fireEvent.click(screen.getByRole("button", { name: /Options for this ad/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Hide this ad" }));
    expect(container.querySelector(".ad-banner")).toBeNull();
    expect(JSON.parse(localStorage.getItem("wn-hidden-ads")!)).toEqual(["sp-test"]);
    cleanup();
    const again = render(<SponsoredCard ad={ad} />);
    expect(again.container.querySelector(".ad-banner")).toBeNull();
    expect(screen.queryByText("Why am I seeing this?")).toBeNull();
  });
});
