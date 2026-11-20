import { StoryArt } from "../front/StoryArt";

function prettyDomain(d: string) {
  const base = d.replace(/^www\./, "").split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Link card: brand cover art (no remote fetch), outlet stamp, title, domain. */
export function LinkCard({ link }: { link: { url: string; title: string | null; domain: string } }) {
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={(e) => e.stopPropagation()} className="group mt-2 flex max-w-[520px] items-center gap-3 overflow-hidden rounded-[12px] p-2 ring-1 ring-[var(--hairline)] hover:bg-white/[0.02]">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[8px]"><StoryArt seed={link.url} section="Top Stories" width={160} /></div>
      <div className="min-w-0">
        <p className="truncate text-[12px] text-ink-3">{prettyDomain(link.domain)} · {link.domain}</p>
        {link.title && <p className="line-clamp-2 text-[14px] leading-snug font-medium text-ink-1 group-hover:underline">{link.title}</p>}
      </div>
    </a>
  );
}
