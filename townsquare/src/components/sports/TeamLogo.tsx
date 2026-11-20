"use client";

import { useId, useState } from "react";
import { badgeColors } from "@/lib/sports/badge";
import type { TeamView } from "@/lib/sports/teams";

const PX = { sm: 22, md: 34, lg: 64 } as const;
export type TeamLogoSize = keyof typeof PX;
type TeamLike = Pick<TeamView, "id" | "abbr" | "fullName" | "primary" | "secondary" | "logo" | "league">;

/**
 * Team logo: the cached licensed logo when there is one (lazy-loaded), and
 * the generated badge otherwise, or the moment the image fails to load.
 */
export function TeamLogo({ team, size = "md", className = "", label = true }: { team: TeamLike; size?: TeamLogoSize; className?: string; label?: boolean }) {
  const [failed, setFailed] = useState(false);
  const px = PX[size];
  if (team.logo && !failed) {
    return (
      <img
        src={team.logo}
        alt={label ? `${team.fullName} logo` : ""}
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        data-team-logo="image"
        className={`inline-block shrink-0 object-contain ${className}`}
        style={{ width: px, height: px }}
      />
    );
  }
  return <TeamBadge team={team} px={px} className={className} label={label} />;
}

/**
 * Generated badge: a shield in the team's primary color, a secondary-color
 * chevron, and the abbreviation in whichever color reads best. No logo
 * artwork, so nothing trademarked and nothing that can fail to load.
 */
export function TeamBadge({ team, px, className = "", label = true }: { team: TeamLike; px: number; className?: string; label?: boolean }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  const c = badgeColors(team.primary, team.secondary);
  const fs = team.abbr.length >= 4 ? 19 : team.abbr.length === 3 ? 23 : 28;
  const soccer = team.league === "MLS" || team.league === "EPL";
  const shape = soccer ? "M32 4 L56 12 V30 C56 46 46 56 32 61 C18 56 8 46 8 30 V12 Z" : "M32 3 L57 13 C57 37 49 52 32 61 C15 52 7 37 7 13 Z";
  return (
    <svg
      viewBox="0 0 64 64"
      width={px}
      height={px}
      role={label ? "img" : undefined}
      aria-label={label ? `${team.fullName}` : undefined}
      aria-hidden={label ? undefined : true}
      data-team-logo="badge"
      className={`inline-block shrink-0 ${className}`}
      style={{ ["--ring-d" as string]: c.ringDark, ["--ring-l" as string]: c.ringLight }}
    >
      <defs>
        <clipPath id={`c${u}`}><path d={shape} /></clipPath>
        <linearGradient id={`g${u}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.18" /><stop offset="0.55" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      <path d={shape} fill={c.fill} />
      <g clipPath={`url(#c${u})`}>
        <path d="M0 53 L32 48 L64 53 V64 H0 Z" fill={c.accent} opacity="0.95" />
        <path d="M0 57.5 L32 52.5 L64 57.5" stroke={c.fill} strokeWidth="2" fill="none" />
        <rect width="64" height="64" fill={`url(#g${u})`} />
      </g>
      <path d={shape} fill="none" className="team-badge-ring" strokeWidth="2.5" />
      <text x="32" y={fs >= 28 ? 33 : 32} textAnchor="middle" dominantBaseline="middle" fill={c.text} fontFamily="var(--font-display), 'Arial Narrow', sans-serif" fontWeight="800" fontSize={fs} letterSpacing="0.5">
        {team.abbr}
      </text>
    </svg>
  );
}
