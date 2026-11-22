import type { Metadata } from "next";
import { SectionPage } from "@/components/sections/SectionPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Culture", description: "Film, music, TV and books: the culture news people are talking about." };

export default async function Page({ searchParams }: { searchParams: Promise<{ beat?: string }> }) {
  return <SectionPage section="culture" beat={(await searchParams).beat ?? null} />;
}
