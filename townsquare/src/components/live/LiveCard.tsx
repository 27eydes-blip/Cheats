import Link from "next/link";
import type { LiveEventView } from "@/lib/news";
import { LinkArt } from "../post/LinkCard";
import { Avatar } from "../ui/Avatar";
import { LiveBadge } from "../ui/Badge";
import { EyeIcon, MicIcon, PlayIcon } from "../icons";

const KIND = { stream: "Live show", audio: "Audio room", debate: "Debate", liveblog: "Live blog" } as const;

/** A show that's on air: poster art, pulsing LIVE tag, viewer count, host with live ring. */
export function LiveCard({ e }: { e: LiveEventView }) {
  return (
    <Link href={`/live/${e.id}`} className="group block overflow-hidden rounded-[var(--r-xl)] bg-[var(--ticker-bg)] text-white ring-1 ring-live/40 transition-shadow duration-300 hover:shadow-[0_0_0_1px_var(--live),0_12px_40px_rgb(225_29_46/0.28)]">
      <div className="relative aspect-video">
        <div className="absolute inset-0 opacity-75 transition-transform duration-700 group-hover:scale-105"><LinkArt seed={e.id + e.title} /></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/10" />
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <LiveBadge />
          <span className="num flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[11.5px] font-semibold backdrop-blur"><EyeIcon size={13} /> {e.viewers.toLocaleString("en-US")}</span>
        </div>
        <span className="absolute top-1/2 left-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
          {e.kind === "audio" ? <MicIcon size={24} /> : <PlayIcon size={22} />}
        </span>
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-3.5">
          {e.host && <Avatar url={e.host.avatarUrl} name={e.host.displayName} handle={e.host.handle} size={44} live />}
          <div className="min-w-0">
            <p className="kicker text-white/70">{KIND[e.kind]}</p>
            <h3 className="line-clamp-2 text-[16px] leading-snug font-semibold">{e.title}</h3>
            {e.host && <p className="truncate text-[12.5px] text-white/70">{e.host.displayName}</p>}
          </div>
        </div>
      </div>
    </Link>
  );
}

export { KIND as LIVE_KIND };
