import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { communityPosts, getCommunity, type CommunitySort } from "@/lib/communities";
import { getViewer } from "@/lib/session";
import { CommunityArt, CommunityIconTile } from "@/components/community/CommunityArt";
import { CommunityPostRow } from "@/components/community/CommunityPostRow";
import { JoinButton } from "@/components/community/JoinButton";
import { NewCommunityPost } from "@/components/community/NewCommunityPost";
import { BackIcon } from "@/components/icons";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { EmptyState } from "@/components/ui/States";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = getCommunity((await params).slug, null);
  return { title: c ? c.name : "Community" };
}

export default async function CommunityPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sort?: string }> }) {
  const [{ slug }, sp, viewer] = await Promise.all([params, searchParams, getViewer()]);
  const c = getCommunity(slug, viewer?.id ?? null);
  if (!c) notFound();
  const sort = (["hot", "new", "top"].includes(sp.sort ?? "") ? sp.sort : "hot") as CommunitySort;
  const canSee = c.visibility === "public" || c.joined;
  const posts = canSee ? communityPosts(c.id, sort, viewer?.id ?? null) : [];

  return (
    <>
      <header>
        <div className="relative h-36 overflow-hidden sm:h-44">
          <CommunityArt slug={c.slug} className="scale-110" />
          <Link href="/communities" className="absolute top-3 left-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/50" aria-label="All communities">
            <BackIcon size={20} />
          </Link>
        </div>
        <div className="px-4 sm:px-6">
          <div className="-mt-9 flex items-end justify-between gap-3">
            <CommunityIconTile slug={c.slug} name={c.name} size={76} />
            {c.visibility === "public" && <JoinButton communityId={c.id} joined={c.joined} name={c.name} />}
          </div>
          <h1 className="mt-3 font-display text-h1 font-semibold">{c.name}</h1>
          <p className="text-[14px] text-ink-3">c/{c.slug} · {c.visibility}</p>
          <p className="mt-2 text-[15.5px] text-ink-2">{c.description}</p>
          <dl className="mt-4 flex gap-6">
            <div><dt className="kicker text-ink-3">Members</dt><dd className="num font-display text-[24px] font-semibold">{c.members.toLocaleString("en-US")}</dd></div>
            <div><dt className="kicker text-ink-3">This week</dt><dd className="num font-display text-[24px] font-semibold">{c.postsThisWeek} <span className="font-sans text-[13px] font-medium text-ink-3">posts</span></dd></div>
          </dl>
          {c.rules.length > 0 && (
            <details className="group mt-4 rounded-[var(--r-md)] bg-surface-2 px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-semibold">
                Community rules <span className="text-ink-3 transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[14px] text-ink-2">{c.rules.map((r) => <li key={r}>{r}</li>)}</ol>
              <p className="mt-2 text-[12.5px] text-ink-3">Site-wide Community Guidelines always apply.</p>
            </details>
          )}
        </div>
      </header>

      {canSee ? (
        <>
          <div className="sticky-sub glass z-20 mt-4 flex items-center gap-3 border-y border-line px-4 py-2 sm:px-6">
            <SegmentedTabs
              variant="pill"
              active={sort}
              className="w-[220px]"
              tabs={[
                { key: "hot", label: "Hot", href: `/c/${c.slug}` },
                { key: "new", label: "New", href: `/c/${c.slug}?sort=new` },
                { key: "top", label: "Top", href: `/c/${c.slug}?sort=top` },
              ]}
            />
            {c.joined && <div className="ml-auto"><NewCommunityPost communityId={c.id} name={c.name} /></div>}
          </div>
          {posts.length === 0 ? (
            <EmptyState art="community" title="No discussions yet" body={c.joined ? "Start the first one." : "Join to start the first discussion."} />
          ) : (
            posts.map((p) => <CommunityPostRow key={p.id} post={p} slug={c.slug} />)
          )}
        </>
      ) : (
        <EmptyState art="community" title="This community is private" body="Members join by invitation." />
      )}
    </>
  );
}
