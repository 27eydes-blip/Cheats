// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FULL_MOVE_PCT, glowFor, magnitude, MAX_LIFT_PX, MAX_TILT_DEG, moveText, sectorAverage, tileSpan, tiltFrom, topMovers, whiteContrast } from "@/lib/markets/heat";
import type { Quote } from "@/lib/markets/provider";
import { marketStatus } from "@/lib/markets/clock";
import { STOCKS, TICKER_MAP } from "@/lib/markets/universe";
import { MarketData } from "@/components/markets/MarketData";
import { Heatmap3D } from "@/components/markets/Heatmap3D";
import { BigBoard } from "@/components/markets/Floor";

const mk = (symbol: string, pct: number): Quote => ({ symbol, name: symbol, price: 100 + pct, change: pct, changePct: pct, open: 100, high: 103, low: 98, prevClose: 100, ts: 0, series: [] });
const quotes = STOCKS.map((t, i) => mk(t.symbol, ((i % 13) - 6) / 2)); // -3% … +3%

let media: Record<string, boolean> = {};
function setMedia(m: Record<string, boolean>) {
  media = m;
  window.matchMedia = ((q: string) => ({ matches: Object.entries(media).some(([k, v]) => v && q.includes(k)), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}
beforeEach(() => setMedia({}));
afterEach(cleanup);

const wrap = (ui: React.ReactNode, init = quotes) => render(<MarketData initial={init} mode="demo" status={marketStatus()} symbols={[]} watchlist={[]}>{ui}</MarketData>);

describe("size and glow scaling", () => {
  it("lift and glow grow with the size of the move and cap at 3%", () => {
    expect(magnitude(0.05)).toBe(0);
    expect(magnitude(FULL_MOVE_PCT)).toBe(1);
    expect(magnitude(9)).toBe(1);
    expect(magnitude(0.75)).toBeCloseTo(0.5, 5);
    const [small, mid, big] = [0.3, 1, 3].map(glowFor);
    expect(small.lift).toBeLessThan(mid.lift);
    expect(mid.lift).toBeLessThan(big.lift);
    expect(big.lift).toBe(MAX_LIFT_PX);
    expect(big.alpha).toBe(0.75);
    expect(glowFor(-2).dir).toBe(-1);
    expect(glowFor(0.02)).toMatchObject({ dir: 0, lift: 0, alpha: 0 });
  });

  it("keeps white tile text at WCAG AA contrast for every move", () => {
    for (let p = -5; p <= 5; p += 0.25) expect(whiteContrast(glowFor(p).fill)).toBeGreaterThanOrEqual(4.5);
  });

  it("never relies on color alone: arrows with every percent", () => {
    expect(moveText(1.234)).toBe("▲ +1.23%");
    expect(moveText(-0.4)).toBe("▼ -0.40%");
    expect(moveText(0)).toBe("■ +0.00%");
  });

  it("sizes tiles by company size only in Market cap mode; movers, averages and tilt", () => {
    expect(tileSpan(3, "cap")).toEqual({ cols: 2, rows: 2 });
    expect(tileSpan(2, "cap")).toEqual({ cols: 2, rows: 1 });
    expect(tileSpan(3, "change")).toEqual({ cols: 1, rows: 1 });
    expect([...topMovers([mk("A", 1), mk("B", -4), mk("C", 2), mk("D", 0.5)], 2)]).toEqual(["B", "C"]);
    expect(sectorAverage([TICKER_MAP.get("XOM")!, TICKER_MAP.get("CVX")!], { XOM: { changePct: 1 }, CVX: { changePct: -3 } })).toBe(-1);
    expect(tiltFrom(1, 0)).toEqual({ rx: MAX_TILT_DEG, ry: MAX_TILT_DEG });
    expect(tiltFrom(5, 5)).toEqual({ rx: -MAX_TILT_DEG, ry: MAX_TILT_DEG });
    expect(tiltFrom(0.5, 0.5)).toEqual({ rx: -0, ry: 0 });
  });
});

describe("heatmap", () => {
  it(`renders all ${STOCKS.length} tiles with arrows and labels`, () => {
    const { container } = wrap(<Heatmap3D />);
    const tiles = container.querySelectorAll(".hm-tile");
    expect(tiles.length).toBe(STOCKS.length);
    expect(tiles.length).toBeGreaterThanOrEqual(110);
    const aapl = screen.getByRole("button", { name: /^Apple, AAPL:/ });
    expect(aapl.textContent).toMatch(/[▲▼■]/);
    expect(container.querySelectorAll("[data-mover]").length).toBe(3);
  });

  it("tapping a sector plate zooms in, filters the Big Board, and Back returns", () => {
    const { container } = wrap(<><Heatmap3D /><BigBoard /></>);
    fireEvent.click(screen.getByRole("button", { name: /^Energy: average/ }));
    expect(container.querySelector("[data-zoomed]")?.getAttribute("data-zoomed")).toBe("Energy");
    const energy = STOCKS.filter((t) => t.sector === "Energy");
    expect(container.querySelectorAll(".hm-tile").length).toBe(energy.length);
    expect(within(screen.getByRole("table")).getAllByRole("row").length).toBe(energy.length + 1);
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(container.querySelector("[data-zoomed]")).toBeNull();
    expect(container.querySelectorAll(".hm-tile").length).toBe(STOCKS.length);
    expect(within(screen.getByRole("table")).getAllByRole("row").length).toBe(STOCKS.length + 1);
  });

  it("works from the keyboard: focus shows the card, Escape leaves the zoom", () => {
    const { container } = wrap(<Heatmap3D />);
    const tile = screen.getByRole("button", { name: /^NVIDIA, NVDA:/ });
    act(() => tile.focus());
    const card = screen.getByRole("tooltip");
    expect(card.textContent).toContain("NVIDIA");
    expect(card.textContent).toMatch(/DAY 98\.00 – 103\.00/);
    expect(card.textContent).toContain("Technology");
    act(() => tile.blur());
    expect(screen.queryByRole("tooltip")).toBeNull();
    const plate = screen.getByRole("button", { name: /^Utilities: average/ });
    expect(plate.tagName).toBe("BUTTON"); // reachable with Tab, Enter and Space
    fireEvent.click(plate);
    fireEvent.keyDown(container.querySelector(".hm-floor")!, { key: "Escape" });
    expect(container.querySelector("[data-zoomed]")).toBeNull();
  });

  it("mode toggle switches tile sizing", () => {
    const { container } = wrap(<Heatmap3D />);
    const aapl = () => container.querySelector('[data-symbol="AAPL"]') as HTMLElement;
    expect(aapl().style.gridColumn).toBe("span 2");
    fireEvent.click(screen.getByRole("button", { name: "Day change" }));
    expect(aapl().style.gridColumn).toBe("span 1");
    expect(screen.getByRole("button", { name: "Day change" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("reduced motion: the flat version, and the pointer never tilts it", () => {
    setMedia({ "prefers-reduced-motion": true });
    const { container } = wrap(<Heatmap3D />);
    const floor = container.querySelector(".hm-floor")!;
    expect(floor.hasAttribute("data-reduced")).toBe(true);
    fireEvent.pointerMove(floor, { pointerType: "mouse", clientX: 10, clientY: 10 });
    expect((container.querySelector(".hm-stage") as HTMLElement).style.getPropertyValue("--rx")).toBe("");
  });

  it("phones and touch screens: flat depth, no tilt, 44px sector plates", () => {
    setMedia({ "hover: none": true });
    const { container } = wrap(<Heatmap3D />);
    const floor = container.querySelector(".hm-floor")!;
    expect(floor.hasAttribute("data-flat")).toBe(true);
    fireEvent.pointerMove(floor, { pointerType: "mouse", clientX: 10, clientY: 10 });
    expect((container.querySelector(".hm-stage") as HTMLElement).style.getPropertyValue("--rx")).toBe("");
    for (const b of screen.getAllByRole("button", { name: /: average|: no prices/ })) expect(b.className).toMatch(/min-h-11/);
  });

  it("re-renders only tiles whose prices changed", () => {
    // Memoized tiles: same props -> same DOM node and no flash; changed price -> a flash on that tile only.
    const { container, rerender } = wrap(<Heatmap3D />);
    const before = container.querySelector('[data-symbol="MSFT"]');
    rerender(<MarketData initial={quotes} mode="demo" status={marketStatus()} symbols={[]} watchlist={[]}><Heatmap3D /></MarketData>);
    expect(container.querySelector('[data-symbol="MSFT"]')).toBe(before);
    expect(container.querySelectorAll(".hm-flash").length).toBe(0);
  });
});
