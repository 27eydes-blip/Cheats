import type { Metadata } from "next";
import { SectionPage } from "@/components/sections/SectionPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Business", description: "Markets, companies and the economy, with how outlets across the spectrum cover them." };

export default async function Page({ searchParams }: { searchParams: Promise<{ beat?: string }> }) {
  return <SectionPage section="business" beat={(await searchParams).beat ?? null} />;
}
