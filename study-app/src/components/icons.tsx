import type { SVGProps } from "react";

/**
 * The app's own icon set. One style everywhere: 24px grid, 1.8px rounded
 * strokes, and a soft duotone fill (currentColor at low opacity) on the
 * main shape. Use these instead of a third-party icon pack.
 */
type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size, children, className, ...rest }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size ?? 20}
      height={size ?? 20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Duotone fill layer. */
const Fill = (props: SVGProps<SVGPathElement>) => <path fill="currentColor" fillOpacity={0.14} stroke="none" {...props} />;

export const IconHome = (p: P) => (
  <Svg {...p}>
    <Fill d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" />
    <path d="M3 11 12 4l9 7" />
    <path d="M5.5 9.5V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.5" />
    <path d="M10 20.5v-5h4v5" />
  </Svg>
);

export const IconCamera = (p: P) => (
  <Svg {...p}>
    <Fill d="M3.5 8.5A2 2 0 0 1 5.5 6.5h2l1.4-2h6.2l1.4 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    <path d="M3.5 8.5A2 2 0 0 1 5.5 6.5h2l1.4-2h6.2l1.4 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="13" r="3.6" />
    <path d="M17.5 9.5h.01" />
  </Svg>
);

export const IconPencil = (p: P) => (
  <Svg {...p}>
    <Fill d="m15.5 4.5 4 4L9 19l-5 1 1-5z" />
    <path d="m15.5 4.5 4 4L9 19l-5 1 1-5z" />
    <path d="m13.5 6.5 4 4" />
  </Svg>
);

export const IconLibrary = (p: P) => (
  <Svg {...p}>
    <Fill d="M4 5.5A1.5 1.5 0 0 1 5.5 4H8v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
    <rect x="4" y="4" width="4" height="16" rx="1.5" />
    <rect x="10" y="4" width="4" height="16" rx="1.5" />
    <path d="m16.2 5.2 3.4-.9 2.6 14.6-3.4.9z" />
  </Svg>
);

export const IconSun = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity={0.14} />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </Svg>
);

export const IconMoon = (p: P) => (
  <Svg {...p}>
    <Fill d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </Svg>
);

export const IconSignOut = (p: P) => (
  <Svg {...p}>
    <path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14" />
    <path d="M10 8 6 12l4 4M6 12h9" />
  </Svg>
);

export const IconUpload = (p: P) => (
  <Svg {...p}>
    <Fill d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15z" />
    <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
  </Svg>
);

export const IconCards = (p: P) => (
  <Svg {...p}>
    <rect x="7" y="3.5" width="13" height="15" rx="2.5" fill="currentColor" fillOpacity={0.14} />
    <rect x="7" y="3.5" width="13" height="15" rx="2.5" />
    <path d="M4 7.5v10A3 3 0 0 0 7 20.5h9" />
  </Svg>
);

export const IconSparkle = (p: P) => (
  <Svg {...p}>
    <Fill d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z" />
    <path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z" />
    <path d="M19 16.5v4M17 18.5h4" />
  </Svg>
);

export const IconDoc = (p: P) => (
  <Svg {...p}>
    <Fill d="M6 3.5h8l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1-1.5z" />
    <path d="M14 3.5H6.5A1.5 1.5 0 0 0 5 5v14a1.5 1.5 0 0 0 1.5 1.5h10A1.5 1.5 0 0 0 18 19V7.5z" />
    <path d="M14 3.5v4h4M8.5 12h6M8.5 15.5h4" />
  </Svg>
);

export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconTrash = (p: P) => (
  <Svg {...p}>
    <Fill d="M6.5 7h11l-.8 12a1.5 1.5 0 0 1-1.5 1.4H8.8A1.5 1.5 0 0 1 7.3 19z" />
    <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" />
  </Svg>
);

export const IconArrowLeft = (p: P) => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);

export const IconArrowRight = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const IconChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="m9.5 6 6 6-6 6" />
  </Svg>
);

export const IconHighlighter = (p: P) => (
  <Svg {...p}>
    <Fill d="m14 4 6 6-7.5 7.5-6-6z" />
    <path d="m14 4 6 6-7.5 7.5-6-6z" />
    <path d="m6.5 11.5-2 5.5 2.5 2.5 5.5-2M3.5 21h6" />
  </Svg>
);

export const IconWand = (p: P) => (
  <Svg {...p}>
    <path d="m4 20 11-11M13 7l2-2 4 4-2 2" />
    <path d="M7 3.5v3M5.5 5h3M18.5 14v3M17 15.5h3" />
  </Svg>
);

export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const IconTarget = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" fill="currentColor" fillOpacity={0.14} />
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </Svg>
);

export const IconAlert = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity={0.14} />
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5M12 16.2h.01" />
  </Svg>
);

export const IconImage = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="currentColor" fillOpacity={0.14} />
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m20.5 16-4.5-4.5L7 19.5" />
  </Svg>
);

export const IconText = (p: P) => (
  <Svg {...p}>
    <path d="M5 6.5V5h14v1.5M12 5v14M9.5 19h5" />
  </Svg>
);

export const IconRetry = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" />
    <path d="M4.5 4.5V9H9" />
  </Svg>
);

export const IconPlay = (p: P) => (
  <Svg {...p}>
    <Fill d="M7.5 5.2v13.6a1 1 0 0 0 1.5.9l10.5-6.8a1 1 0 0 0 0-1.7L9 4.3a1 1 0 0 0-1.5.9z" />
    <path d="M7.5 5.2v13.6a1 1 0 0 0 1.5.9l10.5-6.8a1 1 0 0 0 0-1.7L9 4.3a1 1 0 0 0-1.5.9z" />
  </Svg>
);

export const IconTimer = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="13.5" r="7.5" fill="currentColor" fillOpacity={0.14} />
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9.5v4l2.5 2M9.5 2.5h5M19 6l1.5-1.5" />
  </Svg>
);

export const IconTrophy = (p: P) => (
  <Svg {...p}>
    <Fill d="M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M7 6H4.5v1.5A3 3 0 0 0 7.5 10.5M17 6h2.5v1.5a3 3 0 0 1-3 3M12 14v3.5M8.5 20.5h7M9.5 17.5h5v3h-5z" />
  </Svg>
);

export const IconFolderPlus = (p: P) => (
  <Svg {...p}>
    <Fill d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z" />
    <path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z" />
    <path d="M12 11v5M9.5 13.5h5" />
  </Svg>
);

export const IconEraser = (p: P) => (
  <Svg {...p}>
    <Fill d="m14.5 4 6 6-8 8h-5l-3-3z" />
    <path d="m14.5 4 6 6-8 8h-5l-3-3z" />
    <path d="m9 9.5 6 6M7.5 20.5h12" />
  </Svg>
);

export const IconUndo = (p: P) => (
  <Svg {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Svg>
);

export const IconRedo = (p: P) => (
  <Svg {...p}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Svg>
);

export const IconShare = (p: P) => (
  <Svg {...p}>
    <Fill d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12z" />
    <path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" />
    <path d="M12 14V3.5M8 7.5l4-4 4 4" />
  </Svg>
);

export const IconLink = (p: P) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1-1" />
  </Svg>
);

export const IconCopy = (p: P) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" fill="currentColor" fillOpacity={0.14} />
    <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
    <path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" />
  </Svg>
);

export const IconUsers = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8.5" r="3.5" fill="currentColor" fillOpacity={0.14} />
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M3 19.5a6 6 0 0 1 12 0M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.2a6 6 0 0 1 3.5 5.3" />
  </Svg>
);

export const IconBolt = (p: P) => (
  <Svg {...p}>
    <Fill d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z" />
    <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z" />
  </Svg>
);

export const IconBook = (p: P) => (
  <Svg {...p}>
    <Fill d="M4 5a1.5 1.5 0 0 1 1.5-1.5H11v16H5.5A1.5 1.5 0 0 1 4 18z" />
    <path d="M12 6.5c0-1.7 1.3-3 3-3h4.5v14H15a3 3 0 0 0-3 3M12 6.5c0-1.7-1.3-3-3-3H4.5v14H9a3 3 0 0 1 3 3M12 6.5v14" />
  </Svg>
);

export const IconEdit = (p: P) => (
  <Svg {...p}>
    <path d="M12 20h8" />
    <path d="m15.5 4.5 4 4L9 19l-5 1 1-5z" />
  </Svg>
);

export const IconFlame = (p: P) => (
  <Svg {...p}>
    <Fill d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-4-3-6-4-9.5-2 1.5-3 3.5-3 5.5-1-1-1.5-2-1.5-3-2 1.5-4.5 4.5-4.5 7A6.5 6.5 0 0 0 12 21z" />
    <path d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-4-3-6-4-9.5-2 1.5-3 3.5-3 5.5-1-1-1.5-2-1.5-3-2 1.5-4.5 4.5-4.5 7A6.5 6.5 0 0 0 12 21z" />
    <path d="M12 21a2.5 2.5 0 0 1-2.5-2.5c0-1.5 1.5-2.5 2.5-4 1 1.5 2.5 2.5 2.5 4A2.5 2.5 0 0 1 12 21z" />
  </Svg>
);

export const IconGrid = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="4" width="7" height="7" rx="2" fill="currentColor" fillOpacity={0.14} />
    <rect x="4" y="4" width="7" height="7" rx="2" />
    <rect x="13" y="4" width="7" height="7" rx="2" />
    <rect x="4" y="13" width="7" height="7" rx="2" />
    <rect x="13" y="13" width="7" height="7" rx="2" />
  </Svg>
);

export const IconSpinner = ({ className, ...p }: P) => (
  <Svg {...p} className={`animate-spin ${className ?? ""}`}>
    <path d="M12 3a9 9 0 1 1-9 9" />
  </Svg>
);

/**
 * Flashdrop logo: a lime flashcard with a lightning bolt on a near-black tile.
 * Same artwork as assets/brand/*.svg. Below 24px the single-card version is
 * used so it stays legible.
 */
export function BrandMark({ size = 32 }: { size?: number }) {
  const L = "#C4F82A";
  const K = "#0B0C0E";
  const small = size < 24;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="shrink-0">
      <rect width="64" height="64" rx="15" fill={K} />
      <rect width="63" height="63" x=".5" y=".5" rx="14.5" fill="none" stroke="#fff" strokeOpacity=".08" />
      {small ? (
        <g transform="rotate(-8 32 32)">
          <rect x="15" y="10" width="34" height="44" rx="7" fill={L} />
          <path d="M35 17 21 36h10l-3.5 13L43 29H32.5z" fill={K} />
        </g>
      ) : (
        <>
          <rect x="22" y="9" width="28" height="38" rx="6" transform="rotate(14 36 28)" fill={L} opacity=".38" />
          <g transform="rotate(-8 28 35)">
            <rect x="13" y="15" width="30" height="40" rx="6.5" fill={L} />
            <path d="M31.5 20.5 20.5 37.5h8l-2.6 11.5 12-18.5h-8.2z" fill={K} />
          </g>
        </>
      )}
    </svg>
  );
}
