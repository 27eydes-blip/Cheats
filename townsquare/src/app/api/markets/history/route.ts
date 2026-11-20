import { NextResponse, type NextRequest } from "next/server";
import { getHistory, RANGES, type Range } from "@/lib/markets/history";
import { marketMode } from "@/lib/markets/provider";
import { SYMBOL_RE } from "@/lib/markets/universe";

export const dynamic = "force-dynamic";

/** GET /api/markets/history?symbol=AAPL&range=1D|5D|1M|1Y — candles with volume. */
export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").toUpperCase();
  const range = (req.nextUrl.searchParams.get("range") ?? "1D") as Range;
  if (!SYMBOL_RE.test(symbol) || !RANGES.includes(range)) return NextResponse.json({ error: "Bad symbol or range." }, { status: 400 });
  return NextResponse.json({ mode: marketMode(), ...(await getHistory(symbol, range)) }, { headers: { "Cache-Control": "no-store" } });
}
