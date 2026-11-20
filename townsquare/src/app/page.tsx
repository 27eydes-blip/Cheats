import Link from "next/link";
import { APP_NAME, TAGLINE } from "@/config";
import { followingFeed, forYouFeed } from "@/lib/feed";
import { getViewer } from "@/lib/session";
import { whoToFollow } from "@/lib/social";
import { Composer } from "@/components/Composer";
import { Feed } from "@/components/Feed";
import { PageHeader, Tabs } from "@/components/PageHeader";
import { UserList } from "@/components/UserList";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string; welcome?: string }> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const tab = viewer && sp.tab !== "foryou" ? "following" : "foryou";
  const page = tab === "following" ? followingFeed(viewer!.id) : forYouFeed(viewer?.id ?? null);

  return (
    <>
      <PageHeader title="Home">
        <Tabs
          active={tab}
          tabs={[
            ...(viewer ? [{ key: "following", label: "Following", href: "/?tab=following" }] : []),
            { key: "foryou", label: "For You", href: "/?tab=foryou" },
            { key: "breaking", label: "Breaking", href: "/news" },
          ]}
        />
      </PageHeader>

      {!viewer && (
        <section className="border-b border-line bg-accent-soft px-4 py-5">
          <h2 className="text-2xl font-black">Welcome to {APP_NAME}</h2>
          <p className="mt-1 text-[15px]">{TAGLINE} Follow people, join communities, and get live news in one feed you control.</p>
          <div className="mt-3 flex gap-2">
            <Link href="/signup" className="btn-primary">Create account</Link>
            <Link href="/login" className="btn-outline">Log in</Link>
          </div>
        </section>
      )}

      {viewer && sp.welcome && (
        <section className="border-b border-line bg-accent-soft px-4 py-4">
          <h2 className="text-lg font-extrabold">You&apos;re in, @{viewer.handle}! 👋</h2>
          <p className="text-[15px]">Follow a few people to fill up your Following feed. Here are some to start with:</p>
          <div className="mt-2 overflow-hidden rounded-xl bg-bg">
            <UserList users={whoToFollow(viewer.id, 5)} />
          </div>
        </section>
      )}

      {viewer && (
        <div className="hidden border-b border-line sm:block">
          <Composer compact />
        </div>
      )}

      <Feed
        initial={page}
        source={{ tab }}
        live
        prependOwn={tab === "following"}
        empty={
          tab === "following" ? (
            <>
              <p className="text-lg font-bold text-fg">Your Following feed is empty</p>
              <p className="mt-1">Follow people and their posts show up here, newest first. No algorithm.</p>
              <Link href="/explore" className="btn-primary mt-4">Find people to follow</Link>
            </>
          ) : (
            "Nothing here yet."
          )
        }
      />
    </>
  );
}
