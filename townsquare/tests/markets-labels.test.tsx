// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/live", () => ({ useLiveEvents: () => {} }));
vi.mock("@/components/providers", () => ({ useToast: () => vi.fn(), useViewer: () => null }));
vi.mock("@/actions/markets", () => ({ addWatchAction: vi.fn(), removeWatchAction: vi.fn() }));

import type { Quote } from "@/lib/markets/provider";
import { INDEX_ETFS, INDEX_OF, TICKER_MAP, fundLabel, proxyNote } from "@/lib/markets/universe";
import { marketStatus } from "@/lib/markets/clock";
import { MarketData } from "@/components/markets/MarketData";
import { IndexCard } from "@/components/markets/Panels";
import { LiveWire } from "@/components/shell/LiveWire";
import { MarketsCard } from "@/components/sections/MarketsCard";

afterEach(cleanup);

describe("index labels", () => {
  const q = (symbol: string, name: string): Quote => ({ symbol, name, price: 612.28, change: -1, changePct: -0.16, open: 613, high: 614, low: 611, prevClose: 613.28, ts: 0, series: [1, 2] });

  it("index entries carry the fund's own name, and every index fund has a note", () => {
    for (const t of INDEX_ETFS) {
      expect(t.name).toMatch(/ETF|Trust/);
      expect(INDEX_OF[t.symbol]).toBeTruthy();
    }
    expect(proxyNote("SPY")).toBe("Tracked via SPY ETF, not the index level");
    expect(fundLabel("QQQ")).toBe("Nasdaq-100 ETF · QQQ");
    expect(fundLabel("AAPL")).toBe("AAPL");
  });

  it("the index card names the fund and ticker and says it isn't the index level", () => {
    render(<MarketData initial={[q("SPY", TICKER_MAP.get("SPY")!.name)]} mode="demo" status={marketStatus()} symbols={["SPY"]} watchlist={[]}><IndexCard symbol="SPY" /></MarketData>);
    expect(screen.getByText("S&P 500")).toBeTruthy();
    expect(screen.getByText(/SPDR S&P 500 ETF Trust/)).toBeTruthy();
    expect(screen.getByText("Tracked via SPY ETF, not the index level")).toBeTruthy();
  });

  it("tickers and cards never put a fund price under a bare index name", () => {
    const { container } = render(<LiveWire items={[]} quotes={[{ symbol: "SPY", name: "x", price: 612.28, changePct: 0.1 }]} />);
    expect(container.textContent).toContain("S&P 500 ETF · SPY");
    cleanup();
    const card = render(<MarketsCard quotes={[{ symbol: "DIA", name: TICKER_MAP.get("DIA")!.name, price: 441, changePct: 0.2 }]} demo />);
    expect(card.container.textContent).toContain("Dow ETF · DIA");
    expect(card.container.textContent).toContain("Tracked via DIA ETF, not the index level");
  });
});
