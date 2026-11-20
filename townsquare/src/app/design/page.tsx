import { all } from "@/lib/db";
import { trending } from "@/lib/feed";
import { liveEvents, listStories } from "@/lib/news";
import { getPostView } from "@/lib/posts";
import { getViewer } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { PostCard } from "@/components/PostCard";
import { StoryCard } from "@/components/news/StoryCard";
import { LiveCard } from "@/components/live/LiveCard";
import { CommunityIconTile } from "@/components/community/CommunityArt";
import { Avatar } from "@/components/ui/Avatar";
import { Kicker, LiveBadge, SeverityTag, SourceLabel, VerifiedSeal } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { chipClass, TopicChip } from "@/components/ui/Chip";
import { CountdownRing } from "@/components/ui/CountdownRing";
import { Logo, LogoMark } from "@/components/ui/Logo";
import { FeedSkeleton, NewsSkeleton } from "@/components/ui/Skeleton";
import { Sparkline } from "@/components/ui/Sparkline";
import { EmptyState, ErrorState, Illustration } from "@/components/ui/States";
import { Ticker } from "@/components/shell/Ticker";
import { DemoControls, DemoTabs, DemoVote } from "./DemoControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Design system" };

const SWATCHES = [
  ["--canvas", "Canvas"], ["--surface", "Surface"], ["--surface-2", "Surface 2"], ["--surface-3", "Surface 3"],
  ["--ink-1", "Ink 1"], ["--ink-2", "Ink 2"], ["--ink-3", "Ink 3"], ["--accent", "Accent"],
  ["--breaking", "Breaking"], ["--live", "Live"], ["--success", "Success"], ["--warning", "Warning"], ["--danger", "Danger"],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-6 sm:px-6">
      <h3 className="kicker mb-4 text-ink-3">{title}</h3>
      {children}
    </section>
  );
}

function pick(sql: string) {
  return all<{ id: string }>(sql)[0]?.id;
}

/** Every component and state, rendered once per theme. */
function Gallery({ viewerId }: { viewerId: string | null }) {
  const ids = [
    pick("SELECT p.id FROM posts p WHERE EXISTS (SELECT 1 FROM media m WHERE m.post_id = p.id) AND p.deleted_at IS NULL ORDER BY (SELECT count(*) FROM media m WHERE m.post_id = p.id) DESC LIMIT 1"),
    pick("SELECT post_id id FROM polls LIMIT 1"),
    pick("SELECT id FROM posts WHERE quote_of_id IS NOT NULL AND deleted_at IS NULL LIMIT 1"),
    pick("SELECT id FROM posts WHERE link_url IS NOT NULL AND deleted_at IS NULL LIMIT 1"),
  ].filter(Boolean) as string[];
  const posts = ids.map((id) => getPostView(id, viewerId)).filter(Boolean);
  const trend = trending(1)[0];
  const story = listStories(1)[0];
  const live = liveEvents().find((e) => e.isLive);
  return (
    <div className="bg-surface text-ink-1">
      <Section title="Brand">
        <div className="flex flex-wrap items-center gap-6">
          <Logo />
          <LogoMark size={64} />
          <LogoMark size={40} />
          <LogoMark size={24} />
        </div>
      </Section>
      <Section title="Color tokens">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {SWATCHES.map(([v, l]) => (
            <div key={v} className="overflow-hidden rounded-[var(--r-md)] ring-1 ring-line">
              <div className="h-12" style={{ background: `var(${v})` }} />
              <p className="px-2 py-1.5 text-[11.5px]"><b>{l}</b><br /><code className="text-ink-3">{v}</code></p>
            </div>
          ))}
          <div className="overflow-hidden rounded-[var(--r-md)] ring-1 ring-line"><div className="h-12 bg-accent-grad" /><p className="px-2 py-1.5 text-[11.5px]"><b>Accent gradient</b><br /><code className="text-ink-3">--accent-grad</code></p></div>
        </div>
      </Section>
      <Section title="Type scale">
        <p className="font-display text-display font-semibold">Display headline</p>
        <p className="font-display text-h1 font-semibold">Heading 1 — Newsreader</p>
        <p className="font-display text-h2 font-semibold">Heading 2</p>
        <p className="text-h3 font-semibold">Heading 3 — Inter</p>
        <p className="mt-2 text-[16px]">Body text for posts and UI. Fast, readable, and neutral.</p>
        <p className="num mt-1 text-[13px] text-ink-3">Meta · tabular numbers 1,234 · 5,678</p>
        <Kicker className="mt-2 block">Kicker label</Kicker>
      </Section>
      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="ink">Ink</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>
      <Section title="Chips, topics, badges">
        <div className="flex flex-wrap gap-2">
          <span className={chipClass(true)}>Active</span>
          <span className={chipClass(false)}>Inactive</span>
          <TopicChip tag="bikelanes" href="#" count={12} />
          <TopicChip tag="football" href="#" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <LiveBadge />
          <VerifiedSeal size={20} />
          <SeverityTag level="critical" />
          <SeverityTag level="high" />
          <SeverityTag level="medium" />
          <SeverityTag level="low" />
          <SourceLabel name="Example Daily Wire" size="md" />
        </div>
      </Section>
      <Section title="Avatars">
        <div className="flex flex-wrap items-end gap-4">
          {[96, 64, 48, 40, 28].map((s, i) => <Avatar key={s} url={null} name="Demo" handle={["maria_lopez", "coach_dave", "priya_codes", "chef_rosa", "astro_omar"][i]} size={s} />)}
          <Avatar url={null} name="Live" handle="maria_lopez" size={64} live />
          <CommunityIconTile slug="localnews" name="Local News" size={56} />
        </div>
      </Section>
      <Section title="Tabs and votes">
        <DemoTabs />
        <div className="mt-4"><DemoVote /></div>
      </Section>
      <Section title="Data viz">
        <div className="flex flex-wrap items-center gap-6">
          {trend && <Sparkline values={trend.series} width={120} height={36} label="Trend sparkline" />}
          <Sparkline values={[2, 4, 3, 6, 5, 8, 7, 10]} width={120} height={36} color="var(--success)" />
          <CountdownRing progress={0.7} size={36} stroke={3.5} label="70% of time left" />
          <CountdownRing progress={0.25} size={36} stroke={3.5} color="var(--live)" />
        </div>
      </Section>
      <Section title="Ticker">
        <div className="overflow-hidden rounded-[var(--r-md)]">
          <Ticker label="BREAKING" items={[{ text: "Sample breaking headline for the design gallery", href: null }, { text: "Second headline in the marquee", href: null }]} />
        </div>
      </Section>
      <Section title="Overlays and feedback">
        <DemoControls />
      </Section>
      <Section title="Post cards (media · poll · quote · link)">
        <div className="-mx-4 overflow-hidden rounded-[var(--r-lg)] ring-1 ring-line sm:-mx-6">
          {posts.map((p) => p && <PostCard key={p.id} post={p} />)}
        </div>
      </Section>
      <Section title="Story and live cards">
        <div className="grid gap-3 sm:grid-cols-2">
          {story && <StoryCard story={story} />}
          {live && <LiveCard e={live} />}
        </div>
      </Section>
      <Section title="Loading states">
        <div className="overflow-hidden rounded-[var(--r-lg)] ring-1 ring-line"><FeedSkeleton count={2} /></div>
        <div className="mt-3 overflow-hidden rounded-[var(--r-lg)] ring-1 ring-line"><NewsSkeleton /></div>
      </Section>
      <Section title="Empty and error states">
        <div className="grid grid-cols-4 gap-3">
          {(["feed", "bookmarks", "notifications", "search", "community", "live", "news", "done"] as const).map((a) => (
            <div key={a} className="rounded-[var(--r-md)] p-2 ring-1 ring-line"><Illustration art={a} size={110} /><p className="text-center text-[11px] text-ink-3">{a}</p></div>
          ))}
        </div>
        <div className="mt-3 overflow-hidden rounded-[var(--r-lg)] ring-1 ring-line"><EmptyState art="feed" title="Empty state title" body="A short, friendly explanation of what goes here." action={{ label: "Primary action", href: "#" }} /></div>
        <ErrorState message="Couldn't load this. Inline retry example." />
      </Section>
    </div>
  );
}

export default async function DesignPage() {
  const viewer = await getViewer();
  return (
    <>
      <PageHeader title="Design system" kicker={<Kicker>Townsquare UI</Kicker>} subtitle="Every component and state, in light and dark. Tokens: src/styles/tokens.css" />
      <div className="light" style={{ ["--avatar-gap" as string]: "var(--surface)" }}>
        <h2 className="bg-surface px-4 pt-4 pb-1 font-display text-h2 font-semibold text-ink-1 sm:px-6">Light</h2>
        <Gallery viewerId={viewer?.id ?? null} />
      </div>
      <div className="dark" style={{ ["--avatar-gap" as string]: "var(--surface)" }}>
        <h2 className="bg-surface px-4 pt-6 pb-1 font-display text-h2 font-semibold text-ink-1 sm:px-6">Dark</h2>
        <Gallery viewerId={viewer?.id ?? null} />
      </div>
    </>
  );
}
