import Link from "next/link";
import { GleydeMark } from "@/components/GleydeMark";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 px-6 text-center">
      <GleydeMark title="" strokeWidth={1.6} className="h-24 w-auto" />
      <h1 className="font-display text-3xl tracking-[0.1em]">Page not found</h1>
      <Link href="/" className="border-b border-gold/40 pb-1 text-sm tracking-[0.2em] text-gold-light uppercase">
        Return home
      </Link>
    </main>
  );
}
