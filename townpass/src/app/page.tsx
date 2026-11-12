import Link from "next/link";
import { Brand, Footer } from "@/components/ui";
import type { City } from "@/lib/db";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function Home() {
  const env = await getEnv();
  const { results: cities } = await env.DB.prepare("SELECT * FROM cities WHERE published = 1 ORDER BY name").all<City>();
  return (
    <main className="mx-auto max-w-xl px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <Brand name={env.BRAND_NAME} />
      <h1 className="mt-6 font-serif text-4xl leading-tight">
        Skip the tourist traps.
        <br />
        <span className="gold-text">Get the local’s guide.</span>
      </h1>
      <p className="mt-3 text-zinc-400">Stores, dinner, nightlife, parking and beaches, verified by locals. One tap to unlock.</p>
      <ul className="mt-8 space-y-3">
        {cities.map((c) => (
          <li key={c.id}>
            <Link href={`/city/${c.slug}`} className="flex items-center justify-between rounded-2xl border border-line bg-panel p-5 active:border-gold">
              <span className="font-serif text-2xl">
                {c.name}
                <span className="text-base text-muted">, {c.state}</span>
              </span>
              <span className="text-gold">→</span>
            </Link>
          </li>
        ))}
        {cities.length === 0 && <li className="text-muted">No cities published yet.</li>}
      </ul>
      <Footer brand={env.BRAND_NAME} support={env.SUPPORT_EMAIL} />
    </main>
  );
}
