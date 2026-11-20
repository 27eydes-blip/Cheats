"use client";

import { useRouter } from "next/navigation";
import { BackIcon } from "./icons";
import { SegmentedTabs, type TabItem } from "./ui/SegmentedTabs";

/**
 * Editorial page header: a large display-serif title that scrolls away, and
 * an optional sticky glass sub-bar (tabs or chips) that stays under the app bar.
 */
export function PageHeader({
  title, subtitle, kicker, back, actions, children, compact,
}: { title: string; subtitle?: React.ReactNode; kicker?: React.ReactNode; back?: boolean; actions?: React.ReactNode; children?: React.ReactNode; compact?: boolean }) {
  const router = useRouter();
  return (
    <>
      <div className={`flex items-end gap-3 px-4 sm:px-6 ${compact ? "pt-3 pb-2" : "pt-5 pb-3 sm:pt-7"}`}>
        {back && (
          <button
            type="button"
            onClick={() => (history.length > 1 ? router.back() : router.push("/"))}
            className="-ml-2 mb-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-full text-ink-1 transition-colors hover:bg-surface-2"
            aria-label="Back"
          >
            <BackIcon size={22} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {kicker && <div className="mb-1">{kicker}</div>}
          <h1 className={`truncate font-display font-semibold ${compact ? "text-h2" : "text-h1"}`}>{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-[14px] text-ink-3">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 self-center">{actions}</div>}
      </div>
      {children && <div className="sticky-sub glass z-20 border-b border-line">{children}</div>}
    </>
  );
}

/** Back-compat wrapper: the old Tabs API, now with the sliding indicator. */
export function Tabs({ tabs, active }: { tabs: TabItem[]; active: string }) {
  return <SegmentedTabs tabs={tabs} active={active} className="px-2 sm:px-4" />;
}
