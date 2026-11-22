import type { Metadata } from "next";
import { SectionPage } from "@/components/sections/SectionPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Politics", description: "Every side of the story: the day's political news, how left, center and right outlets cover it, blindspots, and opinion from across the spectrum." };

export default async function Page({ searchParams }: { searchParams: Promise<{ beat?: string }> }) {
  return <SectionPage section="politics" beat={(await searchParams).beat ?? null} />;
}
