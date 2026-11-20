import Link from "next/link";

/** For You / Following switch at the top of the home feed. For You is the default. */
export function HomeTabs({ tab }: { tab: "foryou" | "following" }) {
  const t = (key: "foryou" | "following", label: string, href: string) => (
    <Link
      href={href}
      scroll={false}
      role="tab"
      aria-selected={tab === key}
      className={`relative flex h-11 flex-1 items-center justify-center rounded-[11px] text-[14px] font-bold tracking-[0.04em] uppercase transition-all duration-200 ${
        tab === key ? "bg-[var(--wn-blue-fill)] text-white shadow-[0_0_0_1px_rgb(127_163_255/0.5)_inset,0_8px_24px_-8px_rgb(47_107_255/0.9)]" : "text-ink-2 hover:bg-white/[0.05] hover:text-ink-1"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div role="tablist" aria-label="Home feed" className="card sticky top-[calc(var(--dial-h)+var(--wire-h)+8px)] z-20 flex gap-1 p-1">
      {t("foryou", "For You", "/")}
      {t("following", "Following", "/?tab=following")}
    </div>
  );
}
