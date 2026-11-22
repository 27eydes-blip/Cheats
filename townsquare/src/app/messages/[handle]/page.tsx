import Link from "next/link";
import { notFound } from "next/navigation";
import { canMessage, thread } from "@/lib/messages";
import { requireViewerPage } from "@/lib/session";
import { toMini, userByHandle } from "@/lib/users";
import { BackIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { AiBadge, VerifiedSeal } from "@/components/ui/Badge";
import { Frame } from "@/components/ui/Frame";
import { Thread } from "./Thread";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversation" };

export default async function Conversation({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const viewer = await requireViewerPage(`/messages/${handle}`);
  const u = userByHandle(handle);
  if (!u || u.status === "deleted" || u.id === viewer.id) notFound();
  const peer = toMini(u);
  const can = canMessage(viewer.id, u.id);
  return (
    <Frame>
      <header className="sticky top-[var(--sub-top)] z-20 flex min-h-14 items-center gap-2 border-b border-rule bg-[var(--glass-strong)] px-2 backdrop-blur-xl">
        <Link href="/messages" aria-label="Back to messages" className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] text-ink-2 hover:bg-white/[0.06]"><BackIcon size={20} /></Link>
        <Link href={`/u/${peer.handle}`} className="flex min-w-0 items-center gap-2.5">
          <Avatar url={peer.avatarUrl} name={peer.displayName} handle={peer.handle} size={36} />
          <span className="min-w-0"><span className="flex items-center gap-1 truncate text-[15px] font-bold">{peer.displayName}{peer.verified && <VerifiedSeal size={14} />}{peer.ai && <AiBadge />}</span><span className="mono block text-[11.5px] text-ink-3">@{peer.handle}</span></span>
        </Link>
      </header>
      <Thread peer={{ id: peer.id, handle: peer.handle, displayName: peer.displayName }} initial={thread(viewer.id, u.id)} blockedReason={can.ok ? null : can.reason} />
    </Frame>
  );
}
