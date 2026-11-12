import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand, Footer, Notice } from "@/components/ui";
import { currentAccess } from "@/lib/access";
import { isAdmin } from "@/lib/admin-auth";
import { accessLabel, formatMoney, getCityBySlug, getGuide, type City, type GuideSection } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { sectionType } from "@/lib/sections";
import { getConditions, type Conditions } from "@/lib/weather";
import { Guide } from "@/components/Guide";
import { WeatherTicker } from "@/components/Weather";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const env = await getEnv();
  const city = await getCityBySlug(env.DB, slug);
  return city ? { title: `${city.name}, ${city.state} local guide` } : {};
}

const STICKER_RE = /^[A-Z0-9-]{3,40}$/;

export default async function CityPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const env = await getEnv();
  const db = env.DB;
  const city = await getCityBySlug(db, slug);
  if (!city) notFound();
  const admin = await isAdmin();
  if (!city.published && !admin) notFound();

  const src = sp.src && STICKER_RE.test(sp.src.toUpperCase()) ? sp.src.toUpperCase() : null;
  if (src) {
    // Count the scan (used for scan -> sale conversion per sticker in admin).
    await db
      .prepare("INSERT INTO scans (city_id, sticker_id, created_at) VALUES (?, ?, ?)")
      .bind(city.id, src, Date.now())
      .run();
  }

  const [access, guide, weather] = await Promise.all([
    currentAccess(db, city, env.ACCESS_TOKEN_SECRET),
    getGuide(db, city.id),
    getConditions(db, city, env.OPEN_METEO_API_KEY),
  ]);

  if (access || admin) {
    const ua = (await headers()).get("user-agent") || "";
    return (
      <Guide
        city={city}
        guide={guide}
        apple={/iPhone|iPad|Macintosh/.test(ua)}
        welcome={sp.welcome === "1"}
        reported={sp.reported ? Number(sp.reported) : undefined}
        adminPreview={!access && admin}
        weather={weather}
        view={{ section: sp.s, q: sp.q, openOnly: sp.open === "1", reservable: sp.res === "1" }}
        brand={env.BRAND_NAME}
        support={env.SUPPORT_EMAIL}
      />
    );
  }
  return <Landing city={city} guide={guide} weather={weather} src={src} canceled={sp.canceled === "1"} error={sp.error} brand={env.BRAND_NAME} support={env.SUPPORT_EMAIL} />;
}

/* ---------------------------------- Landing --------------------------------- */

const FAKE = ["Hidden lobster shack", "Late-night slice spot", "Free parking secret", "Sunset bar w/ no line", "24h pharmacy"];

function Landing(props: {
  city: City;
  guide: GuideSection[];
  weather: Conditions | null;
  src: string | null;
  canceled: boolean;
  error?: string;
  brand: string;
  support: string;
}) {
  const { city, guide } = props;
  const price = formatMoney(city.price_cents, city.currency);
  const total = guide.reduce((n, s) => n + s.listings.length, 0);

  return (
    <>
    {props.weather && <div className="pt-[env(safe-area-inset-top)]"><WeatherTicker c={props.weather} cityName={city.name} /></div>}
    <main className="mx-auto max-w-xl px-5 pb-6 pt-5">
      <Brand name={props.brand} />
      <h1 className="mt-6 font-serif text-5xl leading-none">
        <span className="gold-text">{city.name}</span>
      </h1>
      <p className="mt-3 text-lg text-zinc-300">{city.tagline || `The local's guide to ${city.name}.`}</p>

      {props.canceled && (
        <div className="mt-5">
          <Notice>Payment canceled, no charge was made.</Notice>
        </div>
      )}
      {props.error && (
        <div className="mt-5">
          <Notice tone="red">Something went wrong starting checkout. Please try again.</Notice>
        </div>
      )}

      <ul className="mt-6 flex flex-wrap gap-2">
        {guide.map((s) => (
          <li key={s.id} className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm text-zinc-300">
            {sectionType(s.type).icon} {s.title}
            {s.listings.length > 0 && <span className="text-muted"> · {s.listings.length}</span>}
          </li>
        ))}
      </ul>

      {/* Blurred teaser: fake text, so nothing real leaks before payment. */}
      <div className="relative mt-6" aria-hidden="true">
        <div className="space-y-3 blur-[6px] select-none">
          {FAKE.slice(0, 3).map((t, i) => (
            <div key={i} className="rounded-2xl border border-line bg-panel p-4">
              <div className="flex justify-between">
                <span className="font-serif text-lg">{t}</span>
                <span className="rounded-full bg-open/15 px-2 text-xs text-open">Open now</span>
              </div>
              <p className="mt-2 text-sm text-muted">Main St · Open until 11 PM · $$</p>
              <p className="mt-2 rounded-lg bg-gold/10 p-2 text-sm text-gold-soft">Local tip: ask for the off-menu…</p>
            </div>
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-ink/40 to-ink" />
      </div>

      <form method="post" action="/api/checkout" className="sticky bottom-0 -mx-5 mt-2 bg-gradient-to-t from-ink via-ink to-transparent px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        <input type="hidden" name="city" value={city.slug} />
        {props.src && <input type="hidden" name="src" value={props.src} />}
        <button className="w-full rounded-2xl bg-gold py-4 text-lg font-semibold text-ink shadow-[0_8px_30px_rgba(212,175,55,0.25)] active:bg-gold-deep">
          Unlock for {price}
        </button>
        <p className="mt-2 text-center text-sm text-zinc-300">
          {price} · {accessLabel(city)} · {total > 0 ? `${total}+ spots` : "full guide"}
        </p>
        <p className="mt-1 text-center text-xs text-muted">
          Apple Pay · Google Pay · Card · No account needed
        </p>
      </form>

      <div className="mt-6 space-y-2 text-center text-sm">
        <Link href={`/city/${city.slug}/restore`} className="text-gold underline underline-offset-4">
          Already paid? Restore access
        </Link>
        <p className="text-xs text-muted">
          Secure payment by Stripe. All sales final. See <Link href="/terms" className="underline">Terms</Link>.
        </p>
      </div>
      <Footer brand={props.brand} support={props.support} />
    </main>
    </>
  );
}
