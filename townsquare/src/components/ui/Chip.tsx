import Link from "next/link";

/** Pill-shaped chips for filters, sections, and topics. */
export function chipClass(active: boolean, extra = "") {
  return `inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold transition-[background-color,color,box-shadow] duration-200 ${
    active ? "bg-ink-1 text-canvas shadow-1" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink-1 hover:ring-line-strong"
  } ${extra}`;
}

export function ChipLink({ href, active = false, children, className = "" }: { href: string; active?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} scroll={false} aria-current={active ? "page" : undefined} className={chipClass(active, className)}>
      {children}
    </Link>
  );
}

export function ChipRow({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <nav aria-label={label} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
      {children}
    </nav>
  );
}

/** A topic chip with a soft gradient derived from the topic name. */
export function TopicChip({ tag, href, count }: { tag: string; href: string; count?: number }) {
  let h = 0;
  for (const c of tag) h = (h * 37 + c.charCodeAt(0)) % 360;
  return (
    <Link
      href={href}
      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold text-ink-1 ring-1 ring-line transition-transform duration-150 hover:-translate-y-px"
      style={{ background: `linear-gradient(120deg, hsl(${h} 90% 60% / 0.16), hsl(${(h + 50) % 360} 90% 60% / 0.08))` }}
    >
      <span className="text-ink-3">#</span>
      {tag}
      {count !== undefined && <span className="num text-[12px] font-medium text-ink-3">{count}</span>}
    </Link>
  );
}
