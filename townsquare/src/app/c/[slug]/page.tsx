import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { communityPosts, getCommunity, isEditor, pinnedStoryKey, type CommunitySort } from "@/lib/communities";
import { listStories } from "@/lib/news";
import { getViewer } from "@/lib/session";
import { CommunityPostRow } from "@/components/community/CommunityPostRow";
import { EditorToolbar } from "@/components/community/EditorToolbar";
import { JoinButton } from "@/components/community/JoinButton";
import { NewCommunityPost } from "@/components/community/NewCommunityPost";
import { StoryArt } from "@/components/front/StoryArt";
import { LiveBadge } from "@/components/ui/Badge";
import { Frame } from "@/components/ui/Frame";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { MiniSplit } from "@/components/ui/Stance";
import { EmptyState } from "@/components/ui/States";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = getCommunity((await params).slug, null);
  return { title: c ? c.name : "Desk" };
}

/** A Desk: nameplate banner, pinned Story, and tabs for Stories vs Takes (the Desk's discussions). */
export default async function DeskPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sort?: string; tab?: string }> }) {
  const [{ slug }, sp, viewer] = await Promise.all([params, searchParams, getViewer()]);
  const c = getCommunity(slug, viewer?.id ?? null);
  if (!c) notFound();
  const tab = sp.tab === "stories" ? "stories" : "takes";
  const sort = (["hot", "new", "top"].includes(sp.sort ?? "") ? sp.sort : "hot") as CommunitySort;
  const canSee = c.visibility === "public" || c.joined;
  const editor = isEditor(viewer, c.id);
  const all = listStories(50, { viewerId: viewer?.id ?? null });
  const pin = all.find((s) => s.key === pinnedStoryKey(c.id));
  const beat = pin ? all.filter((s) => s.section === pin.section) : all.slice(0, 6);
  const posts = canSee && tab === "takes" ? communityPosts(c.id, sort, viewer?.id ?? null) : [];

  return (
    <Frame width="medium">
      <header className="relative bg-navy text-white">
        <div className="relative px-4 pt-6 pb-6 sm:px-8 sm:pt-10">
          <Link href="/communities" className="folio !text-[10px] text-gold hover:underline">← All Desks</Link>
          <h1 className="mt-3 font-display text-mega font-semibold">{c.name}</h1>
          <p className="mt-2 max-w-[620px] text-[16px] text-white/80">{c.description}</p>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <span className="mono text-[12px] text-white/75">{c.members.toLocaleString("en-US")} MEMBERS · {c.postsThisWeek} POSTS THIS WEEK · {c.visibility.toUpperCase()}</span>
            {c.visibility === "public" && <JoinButton communityId={c.id} joined={c.joined} name={c.name} size="sm" />}
          </div>
        </div>
        <div aria-hidden="true" className="h-1 bg-gold" />
      </header>
      {editor && <EditorToolbar communityId={c.id} pinned={pin?.key ?? null} stories={all.map((s) => ({ key: s.key, title: s.title }))} />}

      {pin && (
        <Link href={`/news/story/${pin.key}`} className="group mx-4 mt-6 grid gap-4 border-b border-rule pb-6 sm:mx-6 sm:grid-cols-[220px_1fr]">
          <div className="aspect-[3/2] overflow-hidden"><StoryArt seed={pin.key} section={pin.section} photo={pin.photo} /></div>
          <div>
            <p className="folio flex items-center gap-2 text-gold-ink">Pinned by the editors {pin.status === "live" && <LiveBadge label="LIVE" />}</p>
            <h2 className="mt-1 font-display text-h1 font-semibold group-hover:underline">{pin.title}</h2>
            <MiniSplit split={pin.split} className="mt-3" />
          </div>
        </Link>
      )}

      {c.rules.length > 0 && (
        <details className="group mx-4 mt-4 border-l-2 border-navy-ink bg-paper-2 px-4 py-3 sm:mx-6">
          <summary className="folio flex cursor-pointer list-none items-center justify-between !text-[10.5px]">Desk rules <span className="transition-transform group-open:rotate-180">⌄</span></summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[14px] text-ink-2">{c.rules.map((r) => <li key={r}>{r}</li>)}</ol>
          <p className="mt-2 text-[12.5px] text-ink-3">Site-wide Community Guidelines always apply. Same rules for every account.</p>
        </details>
      )}

      {canSee ? (
        <>
          <div className="sticky-sub z-20 mt-6 flex flex-wrap items-center gap-3 border-y border-rule bg-paper px-4 py-2 sm:px-6">
            <SegmentedTabs variant="pill" active={tab} className="w-[220px]" tabs={[{ key: "takes", label: "Dispatches", href: `/c/${c.slug}` }, { key: "stories", label: "Stories", href: `/c/${c.slug}?tab=stories` }]} />
            {tab === "takes" && (
              <SegmentedTabs variant="pill" active={sort} className="w-[200px]" tabs={[{ key: "hot", label: "Hot", href: `/c/${c.slug}` }, { key: "new", label: "New", href: `/c/${c.slug}?sort=new` }, { key: "top", label: "Top", href: `/c/${c.slug}?sort=top` }]} />
            )}
            {c.joined && <div className="ml-auto"><NewCommunityPost communityId={c.id} name={c.name} /></div>}
          </div>
          {tab === "stories" ? (
            <ul className="px-4 sm:px-6">
              {beat.map((s) => (
                <li key={s.key} className="border-b border-rule py-4">
                  <Link href={`/news/story/${s.key}`} className="group block">
                    <span className="folio !text-[10px] text-ink-3">{s.status === "live" ? "Live · " : ""}{s.section === "Top Stories" ? "U.S." : s.section} · {s.takes} dispatches</span>
                    <span className="mt-1 block font-display text-[21px] leading-snug font-semibold group-hover:underline">{s.title}</span>
                    <MiniSplit split={s.split} className="mt-2" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : posts.length === 0 ? (
            <EmptyState art="community" title="No discussions yet" body={c.joined ? "Start the first one." : "Join to start the first discussion."} />
          ) : (
            posts.map((p) => <CommunityPostRow key={p.id} post={p} slug={c.slug} editor={editor} />)
          )}
        </>
      ) : (
        <EmptyState art="community" title="This Desk is private" body="Members join by invitation." />
      )}
    </Frame>
  );
}
