import type { League } from "@/lib/sports/teams-data";

/** Small line icons for the league tabs (decorative: the tab text names the league). */
export function LeagueIcon({ league, size = 16 }: { league: League | "ALL"; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (league) {
    case "NFL":
    case "NCAAF":
      return (
        <svg {...p}>
          <ellipse cx="12" cy="12" rx="9.5" ry="6" transform="rotate(-40 12 12)" />
          <path d="M9.5 14.5l5-5M10.5 11l1 1M12 9.5l1 1M13.5 8l1 1" />
        </svg>
      );
    case "NBA":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3v18M5.6 5.6c3.6 3.6 3.6 9.2 0 12.8M18.4 5.6c-3.6 3.6-3.6 9.2 0 12.8" />
        </svg>
      );
    case "MLB":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M7 4.5c2 2.2 2 12.8 0 15M17 4.5c-2 2.2-2 12.8 0 15" />
        </svg>
      );
    case "NHL":
      return (
        <svg {...p}>
          <path d="M5 3l7 13h5.5a1.5 1.5 0 010 3H11L3 4" />
          <ellipse cx="18" cy="8" rx="3.5" ry="1.6" />
          <path d="M14.5 8v1.6c0 .9 1.6 1.6 3.5 1.6s3.5-.7 3.5-1.6V8" />
        </svg>
      );
    case "MLS":
    case "EPL":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5l3.5 2.5-1.3 4h-4.4l-1.3-4zM12 3v4.5M15.5 10l4.8-1.6M14.2 14l3 4M9.8 14l-3 4M8.5 10L3.7 8.4" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        </svg>
      );
  }
}
