import Link from "next/link";

/** Square-ish chips for filters and sections (no pills). */
export function chipClass(active: boolean, extra = "") {
  return `tap inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-semibold transition-[background-color,color,box-shadow] duration-200 ${
    active ? "bg-navy text-white shadow-[inset_0_-2px_0_var(--gold)]" : "bg-paper text-ink-2 ring-1 ring-rule hover:text-ink-1 hover:ring-rule-strong"
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
    <nav aria-label={label} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6" data-no-swipe>
      {children}
    </nav>
  );
}

/** A topic link styled as a dateline tag. */
export function TopicChip({ tag, href, count }: { tag: string; href: string; count?: number }) {
  return (
    <Link href={href} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-[10px] border-l-2 border-gold bg-paper-2 px-3 text-[13px] font-semibold text-ink-1 transition-colors hover:bg-gold-soft">
      {tag}
      {count !== undefined && <span className="mono text-[11.5px] text-ink-3">{count}</span>}
    </Link>
  );
}
