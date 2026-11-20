import type { SVGProps } from "react";

/** Small inline icon set (stroke icons, 24px grid). Decorative unless given a title. */
type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 22, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const HomeIcon = (p: P) => <Svg {...p}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></Svg>;
export const NewsIcon = (p: P) => <Svg {...p}><path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2h-1" /><path d="M8 9h5M8 13h5M8 17h3" /></Svg>;
export const CommunityIcon = (p: P) => <Svg {...p}><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c3 0 6 1.8 6 5.5" /></Svg>;
export const LiveIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="2.5" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" /></Svg>;
export const UserIcon = (p: P) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></Svg>;
export const BellIcon = (p: P) => <Svg {...p}><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9M10 20a2 2 0 0 0 4 0" /></Svg>;
export const SearchIcon = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>;
export const BookmarkIcon = ({ filled, ...p }: P & { filled?: boolean }) => <Svg {...p}><path d="M6 3h12v18l-6-4.5L6 21z" fill={filled ? "currentColor" : "none"} /></Svg>;
export const SettingsIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Svg>;
export const ShieldIcon = (p: P) => <Svg {...p}><path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z" /></Svg>;
export const HashIcon = (p: P) => <Svg {...p}><path d="M5 9h14M4 15h14M10 3 8 21M16 3l-2 18" /></Svg>;
export const PlusIcon = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const ReplyIcon = (p: P) => <Svg {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></Svg>;
export const RepostIcon = (p: P) => <Svg {...p}><path d="m17 2 3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></Svg>;
export const HeartIcon = ({ filled, ...p }: P & { filled?: boolean }) => <Svg {...p}><path d="M12 20s-7.5-4.6-9.2-9.2C1.6 7.4 4 4 7.4 4c2 0 3.5 1.1 4.6 2.6C13.1 5.1 14.6 4 16.6 4 20 4 22.4 7.4 21.2 10.8 19.5 15.4 12 20 12 20z" fill={filled ? "currentColor" : "none"} /></Svg>;
export const ShareIcon = (p: P) => <Svg {...p}><path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></Svg>;
export const MoreIcon = (p: P) => <Svg {...p}><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></Svg>;
export const ImageIcon = (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></Svg>;
export const PollIcon = (p: P) => <Svg {...p}><path d="M5 20V10M12 20V4M19 20v-7" /></Svg>;
export const CloseIcon = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const BackIcon = (p: P) => <Svg {...p}><path d="M15 5l-7 7 7 7" /></Svg>;
export const LinkIcon = (p: P) => <Svg {...p}><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></Svg>;
export const CalendarIcon = (p: P) => <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Svg>;
export const PinIcon = (p: P) => <Svg {...p}><path d="M9 3h6l-1 6 4 3v2H6v-2l4-3zM12 14v7" /></Svg>;
export const FlagIcon = (p: P) => <Svg {...p}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></Svg>;
export const BlockIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></Svg>;
export const MuteIcon = (p: P) => <Svg {...p}><path d="M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6" /></Svg>;
export const EditIcon = (p: P) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" /></Svg>;
export const TrashIcon = (p: P) => <Svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>;
export const QuoteIcon = (p: P) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /></Svg>;
export const LogoutIcon = (p: P) => <Svg {...p}><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3" /></Svg>;

export const SunIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>;
export const MoonIcon = (p: P) => <Svg {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Svg>;
export const MonitorIcon = (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Svg>;
export const CommandIcon = (p: P) => <Svg {...p}><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" /></Svg>;
export const ChevronRight = (p: P) => <Svg {...p}><path d="m9 6 6 6-6 6" /></Svg>;
export const ChevronDown = (p: P) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;
export const ArrowUpIcon = (p: P) => <Svg {...p}><path d="M12 19V5M5 12l7-7 7 7" /></Svg>;
export const ArrowRightIcon = (p: P) => <Svg {...p}><path d="M5 12h14M13 5l7 7-7 7" /></Svg>;
export const VoteUpIcon = ({ filled, ...p }: P & { filled?: boolean }) => <Svg {...p}><path d="M12 4 4 13h5v7h6v-7h5z" fill={filled ? "currentColor" : "none"} /></Svg>;
export const VoteDownIcon = ({ filled, ...p }: P & { filled?: boolean }) => <Svg {...p}><path d="M12 20 4 11h5V4h6v7h5z" fill={filled ? "currentColor" : "none"} /></Svg>;
export const CheckIcon = (p: P) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const ClockIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
export const PlayIcon = (p: P) => <Svg {...p}><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></Svg>;
export const MicIcon = (p: P) => <Svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Svg>;
export const MapPinIcon = (p: P) => <Svg {...p}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></Svg>;
export const SparkIcon = (p: P) => <Svg {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></Svg>;
export const TrendIcon = (p: P) => <Svg {...p}><path d="m3 17 6-6 4 4 8-8M15 7h6v6" /></Svg>;
export const EyeIcon = (p: P) => <Svg {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>;
export const BellPlusIcon = (p: P) => <Svg {...p}><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9M10 20a2 2 0 0 0 4 0" /><path d="M12 7v5M9.5 9.5h5" /></Svg>;
export const KeyboardIcon = (p: P) => <Svg {...p}><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></Svg>;
export const LayersIcon = (p: P) => <Svg {...p}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></Svg>;
export const FlameIcon = (p: P) => <Svg {...p}><path d="M12 22c4 0 7-2.8 7-7 0-4.5-3.5-6.5-4.5-10C11 7 9.5 9 9.5 11.5 8 10.8 7.4 9.6 7.3 8.5 5.8 10.2 5 12.3 5 15c0 4.2 3 7 7 7z" /></Svg>;
export const ExpandIcon = (p: P) => <Svg {...p}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></Svg>;

/* ---- Townsquare-specific glyphs (no hearts, no retweet arrows) ---- */
/** Amplify: a broadcast mast with signal arcs. */
export const AmplifyIcon = (p: P) => <Svg {...p}><path d="M12 13v8M9 21h6" /><circle cx="12" cy="11" r="2" /><path d="M8.5 7.5a5 5 0 0 0 0 7M15.5 7.5a5 5 0 0 1 0 7M5.6 4.6a9 9 0 0 0 0 12.8M18.4 4.6a9 9 0 0 1 0 12.8" /></Svg>;
/** Answer: two facing brackets, a take and its reply side by side. */
export const AnswerIcon = (p: P) => <Svg {...p}><path d="M9 5H5v14h4M15 5h4v14h-4" /><path d="M9 10h3M12 14h3" /></Svg>;
/** Save to Rundown: a folio with a down-arrow. */
export const SaveIcon = ({ filled, ...p }: P & { filled?: boolean }) => <Svg {...p}><path d="M5 4h14v16H5z" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.18 : 0} /><path d="M12 8v7M9 12l3 3 3-3" /></Svg>;
export const AgreeIcon = (p: P) => <Svg {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m8 12.5 3 3 5-6" /></Svg>;
export const DisagreeIcon = (p: P) => <Svg {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m9 9 6 6M15 9l-6 6" /></Svg>;
export const ContextIcon = (p: P) => <Svg {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M12 11v5M12 8h.01" /></Svg>;
export const QuestionIcon = (p: P) => <Svg {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9.8 9.5a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.4v.5M12 16.5h.01" /></Svg>;
/** Rundown: a lineup with times. */
export const RundownIcon = (p: P) => <Svg {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h1M4 12h1M4 18h1" strokeWidth={2.4} /></Svg>;
/** Newsdesk: an in-tray. */
export const InboxIcon = (p: P) => <Svg {...p}><path d="M4 13h4l1.5 2.5h5L16 13h4" /><path d="M4 13 6.5 5h11L20 13v6H4z" /></Svg>;
/** Desk: a press desk with columns. */
export const DeskIcon = (p: P) => <Svg {...p}><path d="M3 9h18M5 9v10M19 9v10M9 13h6" /><path d="M7 5h10l2 4H5z" /></Svg>;
/** Live Studio: a broadcast monitor. */
export const StudioIcon = (p: P) => <Svg {...p}><rect x="3" y="6" width="18" height="12" rx="1.5" /><path d="M8 3l4 3 4-3M8 21h8" /><circle cx="17.5" cy="9" r="0.8" fill="currentColor" /></Svg>;
/** Edition: a folded newspaper (Front Page, Briefing). */
export const EditionIcon = (p: P) => <Svg {...p}><path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2" /><path d="M7 8h7M7 11h3M7 14h3M12 11h2v3h-2z" /></Svg>;
/** Take it: a pen nib. */
export const TakeIcon = (p: P) => <Svg {...p}><path d="M14.5 3.5 20.5 9.5 11 19l-6 1 1-6z" /><path d="M13 5l6 6M8.5 15.5l2-2" /></Svg>;
/** The split: a balance scale. */
export const SplitIcon = (p: P) => <Svg {...p}><path d="M12 4v16M8 20h8M5 7h14" /><path d="m5 7-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z" /></Svg>;
export const DownloadIcon = (p: P) => <Svg {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Svg>;
export const GridIcon = (p: P) => <Svg {...p}><rect x="4" y="4" width="7" height="9" /><rect x="13" y="4" width="7" height="5" /><rect x="13" y="11" width="7" height="9" /><rect x="4" y="15" width="7" height="5" /></Svg>;

export { VerifiedSeal as VerifiedBadge } from "./ui/Badge";
