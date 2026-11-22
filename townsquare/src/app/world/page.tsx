import type { Metadata } from "next";
import { SectionPage } from "@/components/sections/SectionPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "World", description: "World news by region (Americas, Europe, Middle East, Asia, Africa), with how outlets across the spectrum cover it." };

export default async function Page({ searchParams }: { searchParams: Promise<{ region?: string }> }) {
  return <SectionPage section="world" beat={(await searchParams).region ?? null} />;
}
