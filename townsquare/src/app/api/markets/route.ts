import { NextResponse, type NextRequest } from "next/server";
import { marketStatus } from "@/lib/markets/clock";
import { getQuotes, marketMode } from "@/lib/markets/provider";
import { SYMBOL_RE } from "@/lib/markets/universe";

export const dynamic = "force-dynamic";

/** GET /api/markets?symbols=AAPL,MSFT — quotes plus market status and data mode. */
export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => SYMBOL_RE.test(s))
    .slice(0, 60);
  const quotes = await getQuotes(symbols);
  return NextResponse.json({ mode: marketMode(), status: marketStatus(), quotes }, { headers: { "Cache-Control": "no-store" } });
}
