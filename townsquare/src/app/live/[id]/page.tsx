import { notFound } from "next/navigation";
import Link from "next/link";
import { searchPosts } from "@/lib/feed";
import { liveEvent } from "@/lib/news";
import { getViewer } from "@/lib/session";
import { StoryArt } from "@/components/front/StoryArt";
import { LIVE_KIND } from "@/components/live/LiveCard";
import { LiveChat } from "@/components/live/LiveChat";
import { FollowButton } from "@/components/FollowButton";
import { BackIcon, EyeIcon, MicIcon, PlayIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { LiveBadge, VerifiedSeal } from "@/components/ui/Badge";
import { all } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LivePlayer({ params }: { params: Promise<{ id: string }> }) {
  const e = liveEvent((await params).id);
  if (!e) notFound();
  const viewer = await getViewer();
  const chat = e.tag ? searchPosts(`#${e.tag}`, viewer?.id ?? null, null, 30).items.map((i) => i.post) : [];
  const follows = viewer && e.host ? all("SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?", [viewer.id, e.host.id]).length > 0 : false;
  return (
    <div className="mx-auto max-w-[1040px] lg:pt-6">
      <div className="relative aspect-video overflow-hidden bg-black text-white">
        <div className="absolute inset-0 opacity-80"><StoryArt seed={e.id + e.title} section="Top Stories" /></div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />
        <Link href="/live" className="absolute top-3 left-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur hover:bg-black/60" aria-label="Back to Live"><BackIcon size={20} /></Link>
        <div className="absolute top-3 right-3 flex items-center gap-2">
          {e.isLive && <LiveBadge />}
          <span className="num flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[12px] font-semibold backdrop-blur"><EyeIcon size={14} /> {e.viewers.toLocaleString("en-US")}</span>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur">
            {e.kind === "audio" ? <MicIcon size={28} /> : <PlayIcon size={26} />}
          </span>
          <p className="max-w-xs px-4 text-[13px] text-white/80">Player preview. Live {e.kind === "audio" ? "audio" : "video"} arrives in Stage 4; the chat below is live today.</p>
        </div>
      </div>
      <div className="px-4 pt-4 sm:px-6">
        <p className="kicker text-live">{LIVE_KIND[e.kind]}{e.isLive ? " · On air" : ""}</p>
        <h1 className="mt-1 font-display text-h1 leading-tight font-semibold">{e.title}</h1>
        <p className="mt-2 text-[15.5px] text-ink-2">{e.description}</p>
        {e.host && (
          <div className="mt-4 flex items-center gap-3 border-l-2 border-gold bg-paper-2 p-3">
            <Avatar url={e.host.avatarUrl} name={e.host.displayName} handle={e.host.handle} size={46} live={e.isLive} />
            <Link href={`/u/${e.host.handle}`} className="min-w-0 flex-1">
              <span className="flex items-center gap-1 font-semibold">{e.host.displayName}{e.host.verified && <VerifiedSeal size={15} />}</span>
              <span className="block text-[13.5px] text-ink-3">Host · @{e.host.handle}</span>
            </Link>
            <FollowButton userId={e.host.id} following={follows} small />
          </div>
        )}
      </div>
      <LiveChat tag={e.tag} initial={chat} />
    </div>
  );
}
