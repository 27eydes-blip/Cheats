"use client";

import { useRouter } from "next/navigation";
import { BackIcon } from "./icons";
import { SegmentedTabs, type TabItem } from "./ui/SegmentedTabs";

/**
 * Editorial page header: a folio, a serif title, a dek, and the double rule.
 * Optional children render as a sticky sub-bar (tabs, chips) under the dial.
 */
export function PageHeader({
  title, subtitle, kicker, back, actions, children, compact,
}: { title: string; subtitle?: React.ReactNode; kicker?: React.ReactNode; back?: boolean; actions?: React.ReactNode; children?: React.ReactNode; compact?: boolean }) {
  const router = useRouter();
  return (
    <>
      <div className={`px-4 sm:px-6 ${compact ? "pt-4 pb-3" : "pt-6 pb-0 lg:pt-10"}`}>
        {back && (
          <button type="button" onClick={() => (history.length > 1 ? router.back() : router.push("/"))} className="folio mb-2 inline-flex items-center gap-1 !text-[10.5px] text-ink-3 hover:text-navy-ink" aria-label="Back">
            <BackIcon size={14} /> Back
          </button>
        )}
        {kicker && <div className="mb-1.5">{kicker}</div>}
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className={`font-display font-extrabold uppercase ${compact ? "text-h1" : "text-display"}`}>{title}</h1>
            {subtitle && <p className="mt-1.5 text-[15px] text-ink-2">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
        {!compact && <div aria-hidden="true" className="double-rule mt-4" />}
        {compact && <div aria-hidden="true" className="mt-3 border-t border-[var(--wn-glass-border)]" />}
      </div>
      {children && <div className="sticky-sub z-20 mt-1 border-b border-rule bg-paper">{children}</div>}
    </>
  );
}

/** Back-compat wrapper: link tabs with the gold sliding indicator. */
export function Tabs({ tabs, active }: { tabs: TabItem[]; active: string }) {
  return <SegmentedTabs tabs={tabs} active={active} className="px-2 sm:px-4" />;
}
