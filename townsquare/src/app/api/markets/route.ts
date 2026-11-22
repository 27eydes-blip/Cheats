import { NextResponse, type NextRequest } from "next/server";
import { marketStatus } from "@/lib/markets/clock";
import { getQuotes, marketMode, trimSeries } from "@/lib/markets/provider";
import { SYMBOL_RE } from "@/lib/markets/universe";

export const dynamic = "force-dynamic";

const list = (v: string | null, max: number) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => SYMBOL_RE.test(s))
    .slice(0, max);

/**
 * GET /api/markets?symbols=AAPL,MSFT[&series=AAPL] — quotes plus market status
 * and data mode. With `series`, only those symbols carry their intraday line.
 */
export async function GET(req: NextRequest) {
  const symbols = list(req.nextUrl.searchParams.get("symbols"), 200);
  const seriesParam = req.nextUrl.searchParams.get("series");
  const quotes = await getQuotes(symbols, Date.now(), { waitMs: 800 });
  return NextResponse.json(
    { mode: marketMode(), status: marketStatus(), quotes: trimSeries(quotes, seriesParam === null ? null : new Set(list(seriesParam, 200))) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
