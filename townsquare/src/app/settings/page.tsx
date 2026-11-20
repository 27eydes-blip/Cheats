import { Frame } from "@/components/ui/Frame";
import Link from "next/link";
import { requireViewerPage } from "@/lib/session";
import { mediaUrl } from "@/lib/users";
import { PageHeader } from "@/components/PageHeader";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { Avatar } from "@/components/ui/Avatar";
import { ChevronRight, EditIcon, KeyboardIcon, MoonIcon, ShieldIcon, UserIcon } from "@/components/icons";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const viewer = await requireViewerPage("/settings");
  const items = [
    { href: "/settings/profile", title: "Edit profile", text: "Photo, banner, name, bio, links", icon: EditIcon },
    { href: "/settings/account", title: "Account", text: `@${viewer.handle} · password · delete account`, icon: UserIcon },
    { href: "/settings/privacy", title: "Privacy and safety", text: "Follower lists, blocked and muted, download your data", icon: ShieldIcon },
    { href: "/settings/display", title: "Display", text: "Theme and text size", icon: MoonIcon },
  ];
  return (
    <Frame>
      <PageHeader title="Settings" />
      <div className="px-4 sm:px-6">
        <Link href={`/u/${viewer.handle}`} className="card flex items-center gap-3.5 p-4 transition-shadow hover:shadow-2">
          <Avatar url={mediaUrl(viewer.avatar_media_id)} name={viewer.display_name} handle={viewer.handle} size={56} />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[20px] font-semibold">{viewer.display_name}</span>
            <span className="block text-[14px] text-ink-3">@{viewer.handle} · View profile</span>
          </span>
          <ChevronRight size={18} className="text-ink-3" />
        </Link>
        <ul className="card mt-4 divide-y divide-line overflow-hidden">
          {items.map(({ href, title, text, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-2/60">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent"><Icon size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{title}</span>
                  <span className="block truncate text-[13.5px] text-ink-3">{text}</span>
                </span>
                <ChevronRight size={18} className="text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
        <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <span><span className="block font-semibold">Appearance</span><span className="text-[13.5px] text-ink-3">Auto follows your device</span></span>
          <ThemeToggle />
        </div>
        <div className="card mt-4 hidden items-center gap-3 p-4 sm:flex">
          <KeyboardIcon size={20} className="text-ink-3" />
          <span className="flex-1 text-[14px] text-ink-2">Press <kbd className="rounded bg-surface-2 px-1.5 ring-1 ring-line">?</kbd> anywhere for keyboard shortcuts, <kbd className="rounded bg-surface-2 px-1.5 ring-1 ring-line">⌘K</kbd> to search.</span>
        </div>
        <p className="py-6 text-[13px] text-ink-3">
          <Link href="/legal/terms" className="hover:underline">Terms</Link> · <Link href="/legal/privacy" className="hover:underline">Privacy</Link> · <Link href="/legal/guidelines" className="hover:underline">Community Guidelines</Link>
        </p>
      </div>
    </Frame>
  );
}
