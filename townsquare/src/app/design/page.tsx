import { APP_SHORT } from "@/config";
import { all } from "@/lib/db";
import { liveEvents, listStories } from "@/lib/news";
import { getPostView } from "@/lib/posts";
import { getViewer } from "@/lib/session";
import { debates, voices } from "@/lib/takes";
import { PostCard } from "@/components/PostCard";
import { DebateCard } from "@/components/front/DebateCard";
import { StoryArt } from "@/components/front/StoryArt";
import { HotStories, StoryTile, VoicesTile } from "@/components/front/Tiles";
import { LiveCard } from "@/components/live/LiveCard";
import { LiveWire } from "@/components/shell/LiveWire";
import { Avatar } from "@/components/ui/Avatar";
import { Kicker, LiveBadge, Rule, SeverityTag, SourceLabel, VerifiedSeal } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { chipClass, TopicChip } from "@/components/ui/Chip";
import { CountdownRing } from "@/components/ui/CountdownRing";
import { Frame, PageTitle } from "@/components/ui/Frame";
import { Logo, LogoMark } from "@/components/ui/Logo";
import { BentoSkeleton, FeedSkeleton } from "@/components/ui/Skeleton";
import { Sparkline } from "@/components/ui/Sparkline";
import { MiniSplit, SplitBar, StanceChip, StanceMeter } from "@/components/ui/Stance";
import { EmptyState, ErrorState, Illustration } from "@/components/ui/States";
import { AgreeIcon, AmplifyIcon, AnswerIcon, ContextIcon, DeskIcon, DisagreeIcon, EditionIcon, InboxIcon, QuestionIcon, RundownIcon, SaveIcon, SplitIcon, StudioIcon, TakeIcon } from "@/components/icons";
import { DemoControls, DemoTabs, DemoVote } from "./DemoControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Design system" };

const SWATCHES = [
  ["--navy", "Navy"], ["--gold", "Gold"], ["--paper", "Paper"], ["--paper-2", "Paper 2"], ["--paper-3", "Paper 3"],
  ["--ink-1", "Ink 1"], ["--ink-2", "Ink 2"], ["--ink-3", "Ink 3"], ["--navy-ink", "Navy ink"], ["--gold-ink", "Gold ink"],
  ["--agree", "Agree"], ["--disagree", "Disagree"], ["--unsure", "Unsure"], ["--live", "Live"],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[var(--wn-glass-border)] px-4 pt-3 pb-8 sm:px-6">
      <h3 className="folio mb-4 text-navy-ink">{title}</h3>
      {children}
    </section>
  );
}

const pick = (sql: string) => all<{ id: string }>(sql)[0]?.id;

function Gallery({ viewerId }: { viewerId: string | null }) {
  const takeIds = [
    pick("SELECT id FROM posts WHERE stance = 'agree' AND story_key IS NOT NULL AND EXISTS (SELECT 1 FROM media m WHERE m.post_id = posts.id) LIMIT 1"),
    pick("SELECT id FROM posts WHERE stance = 'disagree' AND story_key IS NOT NULL LIMIT 1"),
    pick("SELECT post_id id FROM polls LIMIT 1"),
  ].filter(Boolean) as string[];
  const takes = takeIds.map((id) => getPostView(id, viewerId)).filter(Boolean);
  const stories = listStories(4, { viewerId });
  const hot = listStories(3, { order: "hot", viewerId });
  const debate = debates(viewerId, 1)[0];
  const live = liveEvents().find((e) => e.isLive);
  const people = voices(viewerId, 2);
  const icons: [string, typeof TakeIcon][] = [["Take it", TakeIcon], ["Agree", AgreeIcon], ["Disagree", DisagreeIcon], ["Context", ContextIcon], ["Question", QuestionIcon], ["Answer", AnswerIcon], ["Amplify", AmplifyIcon], ["Save", SaveIcon], ["Rundown", RundownIcon], ["Newsdesk", InboxIcon], ["Desk", DeskIcon], ["Studio", StudioIcon], ["Edition", EditionIcon], ["Split", SplitIcon]];
  return (
    <div className="bg-paper text-ink-1">
      <Section title="Brand">
        <div className="flex flex-wrap items-center gap-8"><Logo size="lg" /><LogoMark size={64} /><LogoMark size={32} /><Logo size="sm" /></div>
      </Section>
      <Section title="Color tokens">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
          {SWATCHES.map(([v, l]) => (
            <div key={v} className="ring-1 ring-rule"><div className="h-12" style={{ background: `var(${v})` }} /><p className="px-2 py-1.5 text-[11px]"><b>{l}</b><br /><code className="mono text-ink-3">{v}</code></p></div>
          ))}
        </div>
      </Section>
      <Section title="Type">
        <p className="font-display text-mega font-semibold">Mega headline</p>
        <p className="font-display text-display font-semibold">Display — Newsreader</p>
        <p className="font-display text-h1 font-semibold">Heading 1</p>
        <p className="font-display text-[22px] font-bold uppercase text-ink-2">Condensed label / kicker</p>
        <p className="mt-2 text-[16px]">Take text and UI — Inter. Plain, fast, readable.</p>
        <p className="mono mt-1 text-[12.5px] text-ink-3">MONO · TIMESTAMPS 1:56 AM · STANCES 61/35</p>
        <p className="folio mt-2 text-navy-ink">Folio · small caps section label</p>
        <p className="drop-cap mt-3 max-w-prose text-[16px] text-ink-2">Drop cap paragraph. Fourteen senators crossed party lines to send the roads, rail, and broadband bill to the House, where leaders expect a vote next week.</p>
        <Rule label="Section break" className="mt-4" />
      </Section>
      <Section title="Icons (thin stroke, no hearts or retweets)">
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">{icons.map(([l, I]) => <div key={l} className="flex flex-col items-center gap-1.5 py-2 ring-1 ring-rule"><I size={24} /><span className="text-[11px] text-ink-3">{l}</span></div>)}</div>
      </Section>
      <Section title="Buttons and chips">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary (navy)</Button><Button variant="secondary">Outline</Button><Button variant="ghost">Ghost</Button><span className="btn-gold">Gold</span><Button variant="danger">Danger</Button><Button disabled>Disabled</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><span className={chipClass(true)}>Active</span><span className={chipClass(false)}>Inactive</span><TopicChip tag="infrastructure" href="#" count={15} /></div>
      </Section>
      <Section title="Stance">
        <div className="flex flex-wrap gap-2"><StanceChip stance="agree" /><StanceChip stance="disagree" /><StanceChip stance="context" /><StanceChip stance="question" /><StanceChip stance="agree" size="md" /></div>
        {stories[0] && (
          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            <div className="bg-paper-2 p-5"><StanceMeter type="story" id={stories[0].key} initial={stories[0].split} variant="large" /></div>
            <div className="space-y-4">
              <StanceMeter type="story" id={stories[0].key} initial={stories[0].split} />
              <MiniSplit split={stories[0].split} />
              <SplitBar split={stories[0].split} height={8} className="w-full" />
            </div>
          </div>
        )}
      </Section>
      <Section title="Badges and portraits">
        <div className="flex flex-wrap items-center gap-3"><LiveBadge /><LiveBadge label="LIVE" /><VerifiedSeal size={22} /><SeverityTag level="critical" /><SeverityTag level="high" /><SeverityTag level="medium" /><SeverityTag level="low" /><SourceLabel name="The National Ledger" size="md" /><Kicker tone="gold">Developing</Kicker></div>
        <div className="mt-5 flex flex-wrap items-end gap-5">
          <Avatar url={null} name="A" handle="maria_lopez" size={96} stance="agree" />
          <Avatar url={null} name="B" handle="coach_dave" size={64} stance="disagree" />
          <Avatar url={null} name="C" handle="dr_amina" size={56} stance="context" />
          <Avatar url={null} name="D" handle="astro_omar" size={48} live />
          <Avatar url={null} name="E" handle="chef_rosa" size={40} />
          <Avatar url={null} name="F" handle="kayla_runs" size={28} />
        </div>
      </Section>
      <Section title="Tabs, votes, data">
        <DemoTabs />
        <div className="mt-5 flex flex-wrap items-center gap-6">
          <DemoVote />
          {hot[0] && <Sparkline values={hot[0].series} width={140} height={40} color="var(--gold)" label="Take velocity" />}
          <CountdownRing progress={0.62} size={36} stroke={3.5} color="var(--gold)" label="62% of time left" />
        </div>
      </Section>
      <Section title="Live Wire">
        <LiveWire items={[{ text: "Senate passes $1.2 trillion infrastructure package, 62–38", href: null, at: 0, label: "Breaking" }, { text: "Utilities report 412,000 customers without power", href: null, at: 0, label: "National" }]} />
      </Section>
      <Section title="Overlays and feedback">
        <DemoControls />
      </Section>
      <Section title="Story tiles and art">
        <div className="grid gap-8 sm:grid-cols-2">{stories.slice(1, 3).map((s) => <StoryTile key={s.key} s={s} />)}</div>
        <div className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-7">{["Politics", "World", "Business", "Tech", "Sports", "Culture", "Top Stories"].map((sec) => <div key={sec}><div className="aspect-[4/3]"><StoryArt seed={sec} section={sec} /></div><p className="mt-1 text-[10.5px] text-ink-3">{sec}</p></div>)}</div>
      </Section>
      <Section title="Hot Stories and Voices">
        <div className="grid gap-8 sm:grid-cols-2"><HotStories stories={hot} /><VoicesTile voices={people} /></div>
      </Section>
      <Section title="Takes (media · stance · poll)">
        <div className="-mx-4 ring-1 ring-rule sm:-mx-6">{takes.map((p) => p && <PostCard key={p.id} post={p} />)}</div>
      </Section>
      {debate && <Section title="Debate card"><DebateCard d={debate} /></Section>}
      {live && <Section title="Live Studio monitor"><div className="max-w-sm"><LiveCard e={live} /></div></Section>}
      <Section title="Loading states">
        <div className="ring-1 ring-rule"><BentoSkeleton /></div>
        <div className="mt-3 ring-1 ring-rule"><FeedSkeleton count={2} /></div>
      </Section>
      <Section title="Empty and error states">
        <div className="grid grid-cols-4 gap-3">
          {(["feed", "bookmarks", "notifications", "search", "community", "live", "news", "done"] as const).map((a) => <div key={a} className="p-2 ring-1 ring-rule"><Illustration art={a} size={110} /><p className="text-center text-[11px] text-ink-3">{a}</p></div>)}
        </div>
        <div className="mt-3 ring-1 ring-rule"><EmptyState art="feed" title="Quiet on the desk" body="Editorial empty-state copy goes here." action={{ label: "Front Page", href: "#" }} /></div>
        <ErrorState message="Couldn't load this. Inline retry." />
      </Section>
    </div>
  );
}

export default async function DesignPage() {
  const viewer = await getViewer();
  return (
    <Frame width="medium">
      <PageTitle folio={<Kicker tone="gold">{APP_SHORT} UI</Kicker>} title="Design system" dek="Every component and state, in light and dark. Tokens live in src/styles/tokens.css." />
      <div className="light mt-6" style={{ ["--avatar-gap" as string]: "var(--paper)" }}>
        <h2 className="bg-paper px-4 pt-4 pb-2 font-display text-h1 font-semibold text-ink-1 sm:px-6">Light</h2>
        <Gallery viewerId={viewer?.id ?? null} />
      </div>
      <div className="dark" style={{ ["--avatar-gap" as string]: "var(--paper)" }}>
        <h2 className="bg-paper px-4 pt-6 pb-2 font-display text-h1 font-semibold text-ink-1 sm:px-6">Dark</h2>
        <Gallery viewerId={viewer?.id ?? null} />
      </div>
    </Frame>
  );
}
