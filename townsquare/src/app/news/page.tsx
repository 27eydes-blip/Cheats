import Link from "next/link";
import { latestNews, NEWS_SECTIONS } from "@/lib/news";
import { PageHeader } from "@/components/PageHeader";
import { Time } from "@/components/Time";

export const dynamic = "force-dynamic";
export const metadata = { title: "News" };

export default async function News({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const s = (await searchParams).s;
  const section = NEWS_SECTIONS.find((x) => x === s) ?? "Top Stories";
  const items = latestNews(section);
  return (
    <>
      <PageHeader title="News" subtitle="Headlines link to the original source">
        <nav aria-label="News sections" className="flex gap-2 overflow-x-auto px-4 pb-3">
          {NEWS_SECTIONS.map((x) => (
            <Link key={x} href={x === "Top Stories" ? "/news" : `/news?s=${encodeURIComponent(x)}`} aria-current={x === section ? "page" : undefined}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${x === section ? "border-fg bg-fg text-bg" : "border-line"}`}>
              {x}
            </Link>
          ))}
        </nav>
      </PageHeader>
      <p className="border-b border-line bg-surface px-4 py-2 text-xs text-muted">
        Preview: these are sample headlines from placeholder outlets. Stage 2 pulls real headlines from outlets&apos; RSS feeds, live blogs, and the &ldquo;How it&apos;s covered&rdquo; view.
      </p>
      <ul>
        {items.map((n, i) => (
          <li key={n.id} className="border-b border-line">
            <a href={n.url} target="_blank" rel="noopener noreferrer" className="block px-4 py-3 hover:bg-surface">
              <span className="flex items-center gap-2 text-xs font-bold text-muted uppercase">
                <span className="rounded bg-surface px-1.5 py-0.5 text-fg">{n.source}</span> {n.section} · <Time ms={n.publishedAt} />
              </span>
              <span className={`mt-1 block leading-snug font-extrabold ${i === 0 ? "text-2xl" : "text-lg"}`}>{n.title}</span>
              {n.summary && <span className="mt-1 block text-[15px] text-muted">{n.summary}</span>}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
