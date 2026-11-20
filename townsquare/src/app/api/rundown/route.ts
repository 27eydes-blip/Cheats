import { NextResponse } from "next/server";
import { rundown } from "@/lib/rundown";
import { getViewer } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Log in first" }, { status: 401 });
  return NextResponse.json(rundown(viewer.id));
}
