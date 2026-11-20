import { StoryArt } from "../front/StoryArt";
import { SourceLabel } from "../ui/Badge";

function prettyDomain(d: string) {
  const base = d.replace(/^www\./, "").split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Link card: brand cover art (no remote fetch), outlet stamp, title, domain. */
export function LinkCard({ link }: { link: { url: string; title: string | null; domain: string } }) {
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={(e) => e.stopPropagation()} className="group mt-3 grid grid-cols-[120px_1fr] overflow-hidden ring-1 ring-rule transition-shadow hover:ring-navy-ink sm:grid-cols-[160px_1fr]">
      <div className="aspect-[4/3] overflow-hidden"><StoryArt seed={link.url} section="Top Stories" className="transition-transform duration-500 group-hover:scale-[1.04]" /></div>
      <div className="min-w-0 px-3.5 py-3">
        <SourceLabel name={prettyDomain(link.domain)} />
        {link.title && <p className="mt-1.5 line-clamp-2 font-display text-[16px] leading-snug font-semibold capitalize">{link.title}</p>}
        <p className="mono mt-1 truncate text-[11px] text-ink-3">{link.domain} ↗</p>
      </div>
    </a>
  );
}
