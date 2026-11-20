import { NextResponse, type NextRequest } from "next/server";
import { searchTeams } from "@/lib/sports/teams";

export const dynamic = "force-dynamic";

/** Team search for the "add a tab" sheet. */
export async function GET(req: NextRequest) {
  return NextResponse.json(searchTeams((req.nextUrl.searchParams.get("q") ?? "").slice(0, 40), 8));
}
