import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/ratelimit";

/**
 * Client-side crashes are written to the server log, which Railway shows
 * under the service's Logs. Nothing is stored. Rate-limited per address.
 */
export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim().slice(0, 64);
  try {
    rateLimit("report", `client-error:${ip}`);
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const raw = (await req.text().catch(() => "")).slice(0, 5000);
  let d: Record<string, unknown> = {};
  try {
    d = JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const s = (k: string, n: number) => String(d[k] ?? "").replace(/[\r\n]+/g, " ⏎ ").slice(0, n);
  console.error(`[client-error] ${s("where", 40)} ${s("name", 40)}: ${s("message", 500)} | url=${s("url", 200)} | ua=${s("ua", 200)} | stack=${s("stack", 1500)} | extra=${s("extra", 600)}`);
  return new NextResponse(null, { status: 204 });
}
