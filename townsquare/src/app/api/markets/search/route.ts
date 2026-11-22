import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/ratelimit";
import { searchSymbols } from "@/lib/markets/search";
import { getViewer } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/markets/search?q=cloudflare — U.S. stocks and ETFs matching a name or ticker. Rate-limited per user (or IP). */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ query: "", hits: [], source: "board" });
  if (q.length > 40) return NextResponse.json({ error: "That search is too long." }, { status: 400 });
  const viewer = await getViewer();
  const subject = viewer?.id ?? `ip:${(req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local"}`;
  try {
    rateLimit("marketSearch", subject);
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: "Too many searches. Wait a minute and try again." }, { status: 429, headers: { "Retry-After": "60" } });
    throw e;
  }
  const r = await searchSymbols(q);
  return NextResponse.json(r, { headers: { "Cache-Control": "private, max-age=60" } });
}
