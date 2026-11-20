import { NextResponse } from "next/server";
import { listStories } from "@/lib/news";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listStories(20));
}
