import { bus, type LiveEvent } from "@/lib/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/stream — Server-Sent Events: live stance counts, new Story takes, Live Wire changes. */
export async function GET(req: Request) {
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(ctl) {
      const send = (s: string) => {
        try { ctl.enqueue(enc.encode(s)); } catch { cleanup(); }
      };
      const on = (e: LiveEvent) => send(`data: ${JSON.stringify(e)}\n\n`);
      const ping = setInterval(() => send(": ping\n\n"), 25_000);
      bus.on("event", on);
      cleanup = () => { clearInterval(ping); bus.off("event", on); };
      req.signal.addEventListener("abort", () => { cleanup(); try { ctl.close(); } catch {} });
      send("retry: 5000\n\n");
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
