import Link from "next/link";
import { Brand, Footer } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { City } from "@/lib/db";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function Home() {
  const env = await getEnv();
  const { results: cities } = await env.DB.prepare("SELECT * FROM cities WHERE published = 1 ORDER BY name").all<City>();
  return (
    <main className="mx-auto max-w-xl px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <Brand name={env.BRAND_NAME} />
      <p className="smallcaps mt-8 text-[11px] text-gold-soft">Est. 2026</p>
      <h1 className="mt-1 font-serif text-4xl leading-tight text-ivory">
        Local guides to
        <br />
        <span className="gold-text">America’s coastal towns.</span>
      </h1>
      <div className="rule-engraved mt-4 w-24" />
      <p className="mt-3 text-zinc-400">Where to eat, drink, park and swim, with live weather, UV and open-now hours. Scan a CoastPassGo sticker or choose a town below.</p>
      <ul className="mt-8 space-y-3">
        {cities.map((c) => (
          <li key={c.id}>
            <Link href={`/city/${c.slug}`} className="glass flex items-center justify-between rounded-2xl p-5 active:border-sea">
              <span className="font-serif text-2xl text-ivory">
                {c.name}
                <span className="text-base text-muted">, {c.state}</span>
              </span>
              <Icon name="back" className="size-5 rotate-180 text-gold" />
            </Link>
          </li>
        ))}
        {cities.length === 0 && <li className="text-muted">No cities published yet.</li>}
      </ul>
      <Footer brand={env.BRAND_NAME} support={env.SUPPORT_EMAIL} />
    </main>
  );
}
