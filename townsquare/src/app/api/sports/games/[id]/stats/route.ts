import { NextResponse } from "next/server";
import { eventStats } from "@/lib/sports/hub";

export const dynamic = "force-dynamic";

/** Key stats for one game, if the data source has them ([] otherwise). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const stats = await eventStats((await params).id);
  return NextResponse.json({ stats }, { headers: { "Cache-Control": "public, max-age=60" } });
}
