import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand, Footer, Notice } from "@/components/ui";
import { getCityBySlug } from "@/lib/db";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  email: "Please enter a valid email address.",
  slow: "Too many attempts. Please wait a bit and try again.",
  link: "That link is no longer valid (it may have been refunded). Enter your email for a fresh one.",
};

export default async function Restore({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const env = await getEnv();
  const city = await getCityBySlug(env.DB, slug);
  if (!city) notFound();

  return (
    <main className="mx-auto max-w-xl px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <Brand name={env.BRAND_NAME} />
      <h1 className="mt-6 font-serif text-3xl">Restore access</h1>
      <p className="mt-2 text-zinc-400">
        Enter the email from your Stripe receipt. We’ll send you a link that unlocks the {city.name} guide on this phone.
      </p>
      <div className="mt-5 space-y-3">
        {sp.sent && <Notice tone="green">If that email bought a {city.name} pass, a link is on its way. Check spam too.</Notice>}
        {sp.error && <Notice tone="red">{ERRORS[sp.error] ?? "Something went wrong."}</Notice>}
      </div>
      <form method="post" action="/api/restore" className="mt-6 space-y-3">
        <input type="hidden" name="city" value={city.slug} />
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          className="w-full rounded-2xl border border-line bg-panel px-4 py-4 text-lg text-white placeholder:text-zinc-600 focus:border-gold focus:outline-none"
        />
        <button className="w-full rounded-2xl bg-gold py-4 font-semibold text-ink active:bg-gold-deep">Email me my link</button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href={`/city/${city.slug}`} className="text-muted underline">
          Back to {city.name}
        </Link>
      </p>
      <Footer brand={env.BRAND_NAME} support={env.SUPPORT_EMAIL} />
    </main>
  );
}
