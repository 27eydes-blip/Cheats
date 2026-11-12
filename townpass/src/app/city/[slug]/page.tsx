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
import { Icon } from "@/components/Icon";
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

const FAKE = ["Waterfront seafood house", "Late-night kitchen", "Free parking near the beach", "Sunset bar", "24-hour pharmacy"];

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
      <p className="smallcaps mt-7 text-[11px] text-gold-soft">
        Est. 2026 · {city.name}, {city.state}
      </p>
      <h1 className="mt-1 font-serif text-5xl leading-none">
        <span className="gold-text">{city.name}</span>
      </h1>
      <div className="rule-engraved mt-4 w-24" />
      <p className="mt-4 text-lg text-zinc-300">{city.tagline || `The local's guide to ${city.name}.`}</p>

      {props.canceled && (
        <div className="mt-5">
          <Notice>Payment canceled. You have not been charged.</Notice>
        </div>
      )}
      {props.error && (
        <div className="mt-5">
          <Notice tone="red">Something went wrong starting checkout. Please try again.</Notice>
        </div>
      )}

      <section aria-label="What's inside" className="glass mt-7 overflow-hidden rounded-2xl">
        <p className="smallcaps border-b border-line px-4 py-3 text-[11px] text-gold-soft">What’s inside</p>
        <ul className="grid grid-cols-2 gap-px bg-line">
          {guide.filter((s) => s.listings.length > 0).map((s) => (
            <li key={s.id} className="flex items-center gap-3 bg-panel/90 px-4 py-3">
              <Icon name={sectionType(s.type).icon} className="size-5 text-gold" />
              <span className="min-w-0">
                <span className="block font-serif text-[16px] text-ivory">{s.title}</span>
                <span className="block text-xs text-muted">
                  {s.listings.length} {s.type === "tips" ? "tips" : "places"}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <ul className="space-y-2 border-t border-line px-4 py-4 text-sm text-zinc-300">
          {["Open-now status and hours for every listing", "Live weather, water temperature and UV index", "Directions, calls and table reservations in one tap"].map((t) => (
            <li key={t} className="flex gap-2.5">
              <Icon name="check" className="mt-0.5 size-4 text-gold" strokeWidth={2.25} />
              {t}
            </li>
          ))}
        </ul>
      </section>

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
              <p className="mt-2 rounded-lg bg-gold/10 p-2 text-sm text-gold-soft">Local tip: ask for a table on the deck…</p>
            </div>
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-ink/40 to-ink" />
      </div>

      <form method="post" action="/api/checkout" className="sticky bottom-0 -mx-5 mt-2 bg-gradient-to-t from-ink via-ink to-transparent px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        <input type="hidden" name="city" value={city.slug} />
        {props.src && <input type="hidden" name="src" value={props.src} />}
        <button className="btn-metal flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-lg">
          <Icon name="lock" className="size-5" strokeWidth={2} />
          Unlock the full guide · {price}
        </button>
        <p className="mt-2 text-center text-sm text-zinc-300">
          One-time payment · {accessLabel(city)} · {total > 0 ? `${total}+ places` : "full guide"}
        </p>
        <p className="mt-1 text-center text-xs text-muted">Apple Pay, Google Pay or card. No account required.</p>
      </form>

      <div className="mt-6 space-y-2 text-center text-sm">
        <Link href={`/city/${city.slug}/restore`} className="text-gold underline underline-offset-4">
          Already paid? Restore access
        </Link>
        <p className="text-xs text-muted">
          Payments processed securely by Stripe. All sales are final. See our <Link href="/terms" className="underline">Terms</Link>.
        </p>
      </div>
      <Footer brand={props.brand} support={props.support} />
    </main>
    </>
  );
}
