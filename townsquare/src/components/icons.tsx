import type { SVGProps } from "react";

/** Small inline icon set (stroke icons, 24px grid). Decorative unless given a title. */
type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 22, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
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

export function VerifiedBadge({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Verified account" className="inline-block shrink-0 text-accent">
      <path fill="currentColor" d="M12 1.5 14.6 3.4l3.2-.2 1 3 2.7 1.8-.9 3.1.9 3.1-2.7 1.8-1 3-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3-2.7-1.8.9-3.1-.9-3.1L5.2 6l1-3 3.2.2z" />
      <path d="m8 12.2 2.7 2.7L16.2 9.3" stroke="#fff" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
