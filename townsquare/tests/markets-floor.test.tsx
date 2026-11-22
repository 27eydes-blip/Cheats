// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
afterEach(cleanup);
import { boardRows, breadthOf, fmtCountdown, rangePos, sectorSummaries, sessionRail } from "@/lib/markets/floor";
import type { Quote } from "@/lib/markets/provider";
import { MarketData } from "@/components/markets/MarketData";
import { BigBoard, BellClock, SectorBoard } from "@/components/markets/Floor";
import { STOCKS } from "@/lib/markets/universe";
import { marketStatus } from "@/lib/markets/clock";

const mk = (symbol: string, pct: number, price = 100): Quote => ({ symbol, name: symbol, price, change: pct, changePct: pct, open: 100, high: price + 2, low: price - 2, prevClose: 100, ts: 0, series: [] });
const quotes: Record<string, Quote> = Object.fromEntries(STOCKS.map((t, i) => [t.symbol, mk(t.symbol, ((i % 7) - 3) / 2, 50 + i)]));
quotes.XLK = mk("XLK", 1.25);
quotes.SPY = mk("SPY", 0.4);

describe("floor helpers", () => {
  it("sorts and filters the board; rows without quotes go last", () => {
    const rows = boardRows({ ...quotes, AAPL: undefined as never }, { sort: "changePct", dir: "desc" });
    expect(rows[0].q!.changePct).toBe(1.5);
    expect(rows.at(-1)!.t.symbol).toBe("AAPL");
    expect(boardRows(quotes, { sector: "Energy", sort: "symbol", dir: "asc" }).every((r) => r.t.sector === "Energy")).toBe(true);
    expect(boardRows(quotes, { query: "berk", sort: "symbol", dir: "asc" }).map((r) => r.t.symbol)).toEqual(["BRK.B"]);
    const byPrice = boardRows(quotes, { sort: "price", dir: "asc" }).map((r) => r.q!.price);
    expect(byPrice).toEqual([...byPrice].sort((a, b) => a - b));
  });

  it("breadth, sectors, range and rail", () => {
    expect(breadthOf([mk("A", 1), mk("B", -1), mk("C", 0), undefined])).toMatchObject({ up: 1, down: 1, flat: 1, total: 3 });
    const tech = sectorSummaries(quotes).find((s) => s.key === "Technology")!;
    expect(tech).toMatchObject({ etf: "XLK", pct: 1.25, fromEtf: true });
    expect(sectorSummaries(quotes).find((s) => s.key === "Energy")!.fromEtf).toBe(false);
    expect(rangePos({ price: 101, low: 100, high: 104 })).toBe(0.25);
    const r = sessionRail(9.5 * 60, false);
    expect(r.now).toBeCloseTo(r.open, 6);
    expect(sessionRail(0, true).close).toBeLessThan(sessionRail(0, false).close);
    expect(fmtCountdown(90_061_000)).toBe("1d 01:01:01");
    expect(fmtCountdown(-5)).toBe("00:00:00");
  });
});

describe("floor components", () => {
  const status = marketStatus(Date.parse("2026-11-22T12:00:00-05:00")); // Sunday before Thanksgiving week
  const wrap = (ui: React.ReactNode) => render(<MarketData initial={Object.values(quotes)} mode="demo" status={status} symbols={[]} watchlist={[]}>{ui}</MarketData>);

  it("big board sorts by header and filters by sector chip", () => {
    const { getByRole, getAllByRole } = wrap(<BigBoard />);
    const table = getByRole("table");
    expect(within(table).getAllByRole("row").length).toBe(STOCKS.length + 1);
    fireEvent.click(getByRole("button", { name: /% Chg/ }));
    expect(getByRole("columnheader", { name: /% Chg/ }).getAttribute("aria-sort")).toBe("descending");
    fireEvent.click(getByRole("button", { name: "Utilities" }));
    expect(within(table).getAllByRole("row").length).toBe(STOCKS.filter((t) => t.sector === "Utilities").length + 1);
    expect(getAllByRole("button", { pressed: true }).map((b) => b.textContent)).toContain("Utilities");
  });

  it("sector board and big board share the filter", () => {
    const { getByRole } = wrap(<><SectorBoard /><BigBoard /></>);
    fireEvent.click(getByRole("button", { name: /^Energy XLE/ }));
    expect(within(getByRole("table")).getAllByRole("row").length).toBe(STOCKS.filter((t) => t.sector === "Energy").length + 1);
  });

  it("bell clock names the next bell and lists the holiday calendar", () => {
    const { getByText, getByRole } = wrap(<BellClock />);
    expect(getByText("Opening bell")).toBeTruthy();
    expect(getByText(/Mon, Nov 23 at 9:30 AM ET/)).toBeTruthy();
    const cal = getByRole("list", { name: "Exchange calendar" });
    expect(cal.textContent).toContain("Closed · Thanksgiving");
    expect(cal.textContent).toContain("Closes 1:00 PM");
  });
});
