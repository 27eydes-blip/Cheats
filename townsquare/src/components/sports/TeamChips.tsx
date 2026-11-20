"use client";

import Link from "next/link";
import type { TeamView } from "@/lib/sports/teams";
import { TeamLogo, type TeamLogoSize } from "./TeamLogo";

/** Badges for the teams a story mentions; each links to the team page. */
export function TeamChips({ teams, size = "sm", names = false, max = 3, onImage, linked = true }: { teams: TeamView[]; size?: TeamLogoSize; names?: boolean; max?: number; onImage?: boolean; /** false inside another link (cards) */ linked?: boolean }) {
  if (!teams.length) return null;
  const cls = `inline-flex min-h-7 items-center gap-1.5 rounded-[8px] pr-2 pl-1 text-[12px] font-bold transition-colors ${onImage ? "bg-[rgb(7_11_20/0.65)] text-white ring-1 ring-white/20 backdrop-blur-sm" : "bg-white/[0.04] text-ink-1 ring-1 ring-rule"}`;
  if (!linked)
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        {teams.slice(0, max).map((t) => (
          <span key={t.id} className={cls} title={t.fullName}><TeamLogo team={t} size={size} label={false} />{names ? t.fullName : t.abbr}</span>
        ))}
      </span>
    );
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {teams.slice(0, max).map((t) => (
        <Link
          key={t.id}
          href={`/sports/${t.id}`}
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex min-h-7 items-center gap-1.5 rounded-[8px] pr-2 pl-1 text-[12px] font-bold transition-colors ${onImage ? "bg-[rgb(7_11_20/0.65)] text-white ring-1 ring-white/20 backdrop-blur-sm hover:ring-white/50" : "bg-white/[0.04] text-ink-1 ring-1 ring-rule hover:ring-[var(--wn-glass-border-hot)]"}`}
          title={t.fullName}
        >
          <TeamLogo team={t} size={size} label={false} />
          {names ? t.fullName : t.abbr}
        </Link>
      ))}
    </span>
  );
}
