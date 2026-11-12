import Link from "next/link";
import { ListingCard } from "@/components/ListingCard";
import { Brand, Footer, Notice } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { BeachLine, ConditionsPanel, WeatherTicker } from "@/components/Weather";
import type { City, GuideSection, Listing } from "@/lib/db";
import { isSummer, localTime, openStatus, pickHoursSpec, type LocalTime } from "@/lib/hours";
import { sectionType } from "@/lib/sections";
import type { Conditions } from "@/lib/weather";

/**
 * The paid guide, organised like an app:
 *   Home (search, weather, section tiles, tips preview)  ·  one page per section  ·  bottom tab bar.
 * Everything is plain links and GET forms (?s=food&open=1, ?q=lobster), so it works on weak signal
 * with no client JavaScript.
 */

const TABS: { type: string | null; label: string; icon: string }[] = [
  { type: null, label: "Home", icon: "home" },
  { type: "food", label: "Dining", icon: "food" },
  { type: "nightlife", label: "Nightlife", icon: "nightlife" },
  { type: "beaches", label: "Beaches", icon: "beaches" },
  { type: "parking", label: "Parking", icon: "parking" },
];

export interface GuideView {
  section?: string; // section type, or undefined for Home
  q?: string;
  openOnly?: boolean;
  reservable?: boolean;
}

function isOpen(l: Listing, kind: string, summer: boolean, now: LocalTime) {
  if (!sectionType(kind).uses.hours) return false;
  const st = openStatus(pickHoursSpec(l, summer), now).state;
  return st === "open" || st === "closing";
}

function matches(l: Listing, q: string) {
  const hay = [l.name, l.category, l.address, l.local_tip, l.body, l.details].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function Guide(props: {
  city: City;
  guide: GuideSection[];
  view: GuideView;
  apple: boolean;
  welcome: boolean;
  reported?: number;
  adminPreview: boolean;
  weather: Conditions | null;
  brand: string;
  support: string;
}) {
  const { city, guide, weather, view } = props;
  const now = localTime(city.timezone);
  const summer = isSummer(now.mmdd, city.summer_start, city.summer_end);
  const sections = guide.filter((s) => s.listings.length > 0);
  const base = `/city/${city.slug}`;
  const current = view.section ? sections.find((s) => s.type === view.section) : undefined;
  const q = (view.q ?? "").trim().slice(0, 60);

  const cardProps = {
    now,
    summer,
    seasonLabel: summer ? city.peak_label.toLowerCase() : "off-season",
    timezone: city.timezone,
    apple: props.apple,
    citySlug: city.slug,
  };
  const card = (l: Listing, kind: string) => (
    <ListingCard key={l.id} listing={l} sectionKind={kind} reported={props.reported === l.id} {...cardProps} />
  );

  let body: React.ReactNode;

  if (current) {
    /* ------------------------------ section page ------------------------------ */
    const def = sectionType(current.type);
    const openCount = current.listings.filter((l) => isOpen(l, current.type, summer, now)).length;
    const resCount = current.listings.filter((l) => l.reserve_url).length;
    let list = current.listings;
    if (view.openOnly) list = list.filter((l) => isOpen(l, current.type, summer, now));
    if (view.reservable) list = list.filter((l) => l.reserve_url);
    const chip = (href: string, active: boolean, label: string, lead?: React.ReactNode) => (
      <Link
        href={href}
        scroll={false}
        className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm ${active ? "border-gold bg-gold font-medium text-ink" : "border-line bg-panel text-zinc-200"}`}
      >
        {lead}
        {label}
      </Link>
    );
    body = (
      <>
        <div className="sticky top-0 z-10 -mx-5 border-b border-line bg-ink/95 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
          <div className="flex items-center gap-3">
            <Link href={base} className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-panel text-zinc-200" aria-label="Back to home">
              <Icon name="back" className="size-5" />
            </Link>
            <h1 className="flex min-w-0 flex-1 items-center gap-2 truncate font-serif text-2xl text-white">
              <Icon name={def.icon} className="size-6 text-gold" />
              {current.title}
            </h1>
            <span className="font-mono text-[11px] text-muted">{city.name.toUpperCase()}</span>
          </div>
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
            {chip(`${base}?s=${current.type}`, !view.openOnly && !view.reservable, `All · ${current.listings.length}`)}
            {def.uses.hours &&
              chip(`${base}?s=${current.type}&open=1`, !!view.openOnly, `Open now · ${openCount}`, <span className="size-2 rounded-full bg-open" />)}
            {resCount > 0 &&
              chip(`${base}?s=${current.type}&res=1`, !!view.reservable, `Reservations · ${resCount}`, <Icon name="calendar" className="size-4" />)}
          </div>
        </div>
        {current.intro && <p className="mt-4 text-sm text-zinc-400">{current.intro}</p>}
        {current.type === "beaches" && weather && <BeachLine c={weather} />}
        <div className="mt-4 space-y-3">
          {list.map((l) => card(l, current.type))}
          {list.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
              Nothing {view.openOnly ? "open right now" : "here yet"}.{" "}
              <Link href={`${base}?s=${current.type}`} className="text-gold underline">
                Show all
              </Link>
            </div>
          )}
        </div>
      </>
    );
  } else {
    /* ---------------------------------- home ---------------------------------- */
    const results = q
      ? sections.map((s) => ({ s, items: s.listings.filter((l) => matches(l, q)) })).filter((r) => r.items.length > 0)
      : [];
    const tips = sections.find((s) => s.type === "tips");
    body = (
      <>
        <header className="pt-5">
          <div className="flex items-center justify-between">
            <Brand name={props.brand} />
            <span className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-zinc-300">
              {summer ? `${city.peak_label} hours` : "Off-season hours"}
            </span>
          </div>
          <h1 className="mt-3 font-serif text-4xl">
            <span className="gold-text">{city.name}</span>
          </h1>
        </header>
        {props.adminPreview && (
          <div className="mt-3">
            <Notice>Admin preview, not a paid session.</Notice>
          </div>
        )}
        {props.welcome && (
          <div className="mt-3">
            <Notice tone="green">Access confirmed. We’ve emailed you a link so you can return to this guide on any device.</Notice>
          </div>
        )}

        <form action={base} method="get" role="search" className="mt-4 flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search seafood, pharmacy, parking…"
            aria-label={`Search ${city.name}`}
            enterKeyHint="search"
            className="min-w-0 flex-1 rounded-xl border border-line bg-panel px-4 py-3 text-[16px] text-white placeholder:text-zinc-500 focus:border-gold focus:outline-none"
          />
          <button className="flex shrink-0 items-center rounded-xl bg-gold px-4 text-ink" aria-label="Search">
            <Icon name="search" className="size-5" strokeWidth={2.25} />
          </button>
        </form>

        {q ? (
          <section className="mt-5" aria-label="Search results">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif text-xl text-gold-soft">
                {results.reduce((n, r) => n + r.items.length, 0)} results for “{q}”
              </h2>
              <Link href={base} className="text-sm text-muted underline">
                Clear
              </Link>
            </div>
            {results.length === 0 && <p className="mt-3 text-sm text-muted">No matches. Try a shorter word, like “pizza” or “parking”.</p>}
            {results.map(({ s, items }) => (
              <div key={s.id} className="mt-4">
                <p className="mb-2 flex items-center gap-1.5 font-mono text-[11px] tracking-[0.18em] text-muted">
                  <Icon name={sectionType(s.type).icon} className="size-4" /> {s.title.toUpperCase()}
                </p>
                <div className="space-y-3">{items.map((l) => card(l, s.type))}</div>
              </div>
            ))}
          </section>
        ) : (
          <>
            {weather && (
              <div className="mt-4">
                <ConditionsPanel c={weather} cityName={city.name} />
              </div>
            )}

            <nav aria-label="Sections" className="mt-5 grid grid-cols-2 gap-3">
              {sections.map((s) => {
                const def = sectionType(s.type);
                const open = s.listings.filter((l) => isOpen(l, s.type, summer, now)).length;
                return (
                  <Link
                    key={s.id}
                    href={`${base}?s=${s.type}`}
                    className="hud relative flex min-h-[6.5rem] flex-col overflow-hidden justify-between rounded-2xl border border-line bg-panel p-4 active:border-gold"
                  >
                    <span className="flex size-10 items-center justify-center rounded-xl border border-gold/30 bg-gold/10 text-gold">
                      <Icon name={def.icon} className="size-5" />
                    </span>
                    <span>
                      <span className="block font-serif text-lg leading-tight text-white">{s.title}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-muted">
                        {def.uses.hours ? (
                          <>
                            <span className={open ? "text-open" : ""}>{open} open</span> · {s.listings.length} spots
                          </>
                        ) : (
                          `${s.listings.length} ${s.type === "tips" ? "tips" : "spots"}`
                        )}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </nav>

            {tips && tips.listings.length > 0 && (
              <section className="mt-7" aria-label="Insider tips">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-serif text-xl text-white">Insider tips</h2>
                  <Link href={`${base}?s=tips`} className="text-sm text-gold">
                    View all {tips.listings.length}
                  </Link>
                </div>
                <div className="mt-3 space-y-2">
                  {tips.listings.slice(0, 3).map((t) => (
                    <Link key={t.id} href={`${base}?s=tips#l${t.id}`} className="block rounded-xl border border-line bg-panel px-4 py-3">
                      <span className="block text-[15px] font-semibold text-white">{t.name}</span>
                      <span className="mt-0.5 line-clamp-2 block text-sm text-zinc-400">{t.body}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <div className="pb-[calc(5rem+env(safe-area-inset-bottom))]">
      {weather && !current && (
        <div className="pt-[env(safe-area-inset-top)]">
          <WeatherTicker c={weather} cityName={city.name} />
        </div>
      )}
      <main className="mx-auto max-w-xl px-5">{body}</main>
      <p className="mx-auto mt-8 max-w-xl px-5 text-center text-xs text-muted">
        Hours are shown in local time and can change, especially around holidays. Call ahead when it matters.
      </p>
      <Footer brand={props.brand} support={props.support} />

      <nav
        aria-label="Guide tabs"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {TABS.map((t) => {
            const active = t.type === null ? !current || !TABS.some((x) => x.type === current.type) : current?.type === t.type;
            const has = t.type === null || sections.some((s) => s.type === t.type);
            if (!has) return <span key={t.label} />;
            return (
              <Link
                key={t.label}
                href={t.type ? `${base}?s=${t.type}` : base}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${active ? "text-gold" : "text-zinc-400"}`}
              >
                <Icon name={t.icon} className="size-6" strokeWidth={active ? 2 : 1.6} />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
