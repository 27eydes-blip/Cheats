import Link from "next/link";
import type { LiveEventView } from "@/lib/news";
import { StoryArt } from "../front/StoryArt";
import { Avatar } from "../ui/Avatar";
import { EyeIcon, MicIcon, PlayIcon } from "../icons";

const KIND = { stream: "Live show", audio: "Audio room", debate: "Debate", liveblog: "Live blog" } as const;

/** A studio monitor: bezel, ON AIR light, viewer count, host. */
export function LiveCard({ e }: { e: LiveEventView }) {
  return (
    <Link href={`/live/${e.id}`} className="group block bg-navy p-2 text-white transition-shadow duration-300 hover:shadow-[0_0_0_2px_var(--gold)]">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="flex items-center gap-1.5 rounded-[2px] bg-[#c8102e] px-2 py-0.5 text-[10px] font-black tracking-[0.18em] shadow-[0_0_12px_rgb(255_77_94/0.7)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> ON AIR
        </span>
        <span className="mono flex items-center gap-1 text-[11px] text-white/75"><EyeIcon size={13} /> {e.viewers.toLocaleString("en-US")}</span>
      </div>
      <div className="relative aspect-video overflow-hidden">
        <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-105"><StoryArt seed={e.id + e.title} section="Top Stories" /></div>
        <span className="absolute top-1/2 left-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[4px] bg-black/40 ring-1 ring-white/40 backdrop-blur-sm">
          {e.kind === "audio" ? <MicIcon size={24} /> : <PlayIcon size={22} />}
        </span>
      </div>
      <div className="flex items-end gap-3 px-1 pt-3 pb-1">
        {e.host && <Avatar url={e.host.avatarUrl} name={e.host.displayName} handle={e.host.handle} size={40} live />}
        <div className="min-w-0">
          <p className="folio !text-[9.5px] text-gold">{KIND[e.kind]}</p>
          <h3 className="line-clamp-2 font-display text-[19px] leading-snug font-semibold group-hover:underline">{e.title}</h3>
          {e.host && <p className="truncate text-[12.5px] text-white/70">with {e.host.displayName}</p>}
        </div>
      </div>
    </Link>
  );
}

export { KIND as LIVE_KIND };
