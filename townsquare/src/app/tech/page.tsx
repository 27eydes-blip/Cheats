import type { Metadata } from "next";
import { SectionPage } from "@/components/sections/SectionPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tech", description: "AI, gadgets and cybersecurity news from every outlet covering it." };

export default async function Page({ searchParams }: { searchParams: Promise<{ beat?: string }> }) {
  return <SectionPage section="tech" beat={(await searchParams).beat ?? null} />;
}
