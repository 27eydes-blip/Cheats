"use client";

import { useState } from "react";
import type { TeamView } from "@/lib/sports/teams";

const PX = { sm: 22, md: 34, lg: 64 } as const;
export type TeamLogoSize = keyof typeof PX;
type TeamLike = Pick<TeamView, "id" | "fullName" | "logo"> & { circle?: TeamView["circle"] };
/** Neutral circle for anything without server-computed colors (white on slate: 9.6:1). */
const fallbackCircle = (name: string) => ({ letters: name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 3) || "?", fill: "#3A4256", text: "#FFFFFF" });

/**
 * Team logo in the priority order the server already worked out: an uploaded
 * logo, then the provider badge, then the letter circle. If an image fails to
 * load, the circle takes its place.
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
  return <LetterBadge circle={team.circle ?? fallbackCircle(team.fullName)} name={team.fullName} px={px} className={className} label={label} />;
}

/**
 * The fallback: a circle in the team's color with 1–3 letters in white or
 * near-black, whichever passes 4.5:1 (checked on the server). A faint ring
 * keeps dark or light circles visible on either theme.
 */
export function LetterBadge({ circle, name, px, className = "", label = true }: { circle: TeamView["circle"]; name: string; px: number; className?: string; label?: boolean }) {
  const n = circle.letters.length;
  const fs = n >= 3 ? 21 : n === 2 ? 25 : 30;
  return (
    <svg
      viewBox="0 0 64 64"
      width={px}
      height={px}
      role={label ? "img" : undefined}
      aria-label={label ? name : undefined}
      aria-hidden={label ? undefined : true}
      data-team-logo="letter"
      className={`inline-block shrink-0 ${className}`}
    >
      <circle cx="32" cy="32" r="30" fill={circle.fill} />
      <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2" className="text-ink-1" />
      <text x="32" y="33.5" textAnchor="middle" dominantBaseline="middle" fill={circle.text} fontFamily="var(--font-sans), Inter, Arial, sans-serif" fontWeight="800" fontSize={fs} letterSpacing={n >= 3 ? "-0.5" : "0"}>
        {circle.letters}
      </text>
    </svg>
  );
}
