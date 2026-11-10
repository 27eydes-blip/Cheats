import type { ReactNode } from "react";

function Svg({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconPlay = () => (
  <Svg size={26}>
    <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />
  </Svg>
);
export const IconPause = () => (
  <Svg size={26}>
    <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
  </Svg>
);
export const IconToStart = () => (
  <Svg>
    <path d="M19 5v14L8.5 12z" fill="currentColor" />
    <path d="M5.5 5v14" />
  </Svg>
);
export const IconStop = () => (
  <Svg size={22}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
  </Svg>
);
export const IconMetronome = () => (
  <Svg>
    <path d="M9 3h6l4 18H5z" />
    <path d="M12 16l5-9" />
  </Svg>
);
export const IconTrash = () => (
  <Svg size={20}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
);
export const IconPlus = () => (
  <Svg size={18}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconMinus = () => (
  <Svg size={18}>
    <path d="M5 12h14" />
  </Svg>
);
export const IconBack = () => (
  <Svg>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);
export const IconMic = () => (
  <Svg size={18}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0014 0M12 18v3" />
  </Svg>
);
export const IconMusic = () => (
  <Svg size={18}>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </Svg>
);
export const IconExport = () => (
  <Svg size={20}>
    <path d="M12 15V3M7 8l5-5 5 5M5 14v5a2 2 0 002 2h10a2 2 0 002-2v-5" />
  </Svg>
);
export const IconMore = () => (
  <Svg size={20}>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" />
  </Svg>
);
export const IconChevron = ({ open }: { open: boolean }) => (
  <span className={`chev ${open ? "open" : ""}`}>
    <Svg size={18}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  </span>
);
