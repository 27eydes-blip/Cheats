import Link from "next/link";
import { all } from "@/lib/db";
import { listConversations } from "@/lib/messages";
import { requireViewerPage } from "@/lib/session";
import { toMini } from "@/lib/users";
import { Time } from "@/components/Time";
import { Avatar } from "@/components/ui/Avatar";
import { Kicker, AiBadge, VerifiedSeal } from "@/components/ui/Badge";
import { Frame, PageTitle } from "@/components/ui/Frame";
import { EmptyState } from "@/components/ui/States";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages" };

/** Messages: private one-to-one conversations. You can write to people who follow you. */
export default async function Messages() {
  const viewer = await requireViewerPage("/messages");
  const convos = listConversations(viewer.id);
  const have = new Set(convos.map((c) => c.peer.id));
  const canStart = all<{ id: string; handle: string; display_name: string; avatar_media_id: string | null; verified: number }>(
    `SELECT u.id, u.handle, u.display_name, u.avatar_media_id, u.verified FROM follows f JOIN users u ON u.id = f.follower_id
     WHERE f.followee_id = ? AND u.status = 'active'
       AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ? UNION SELECT blocker_id FROM blocks WHERE blocked_id = ?)
     ORDER BY f.created_at DESC LIMIT 30`,
    [viewer.id, viewer.id, viewer.id],
  ).map(toMini).filter((u) => !have.has(u.id)).slice(0, 8);
  return (
    <Frame>
      <PageTitle folio={<Kicker tone="gold">Private</Kicker>} title="Messages" dek="One-to-one conversations. You can message people who follow you." />
      {convos.length > 0 ? (
        <ul className="space-y-2 px-3 pt-4 sm:px-4">
          {convos.map((c) => (
            <li key={c.peer.id}>
              <Link href={`/messages/${c.peer.handle}`} className={`card card-hover flex min-h-[68px] items-center gap-3 px-3 py-2.5 ${c.unread ? "!border-[var(--wn-blue)]" : ""}`}>
                <Avatar url={c.peer.avatarUrl} name={c.peer.displayName} handle={c.peer.handle} size={46} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[15px] font-bold">{c.peer.displayName}{c.peer.verified && <VerifiedSeal size={14} />}{c.peer.ai && <AiBadge />}<span className="mono ml-auto shrink-0 text-[11px] font-normal text-ink-3"><Time ms={c.last.createdAt} /></span></span>
                  <span className={`block truncate text-[14px] ${c.unread ? "font-semibold text-ink-1" : "text-ink-3"}`}>{c.last.mine ? "You: " : ""}{c.last.body}</span>
                </span>
                {c.unread > 0 && <span className="mono min-w-[22px] rounded-full bg-[var(--wn-blue-fill)] px-1.5 text-center text-[11.5px] leading-[22px] font-bold text-white" aria-label={`${c.unread} unread`}>{c.unread}</span>}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-3 pt-4 sm:px-4"><div className="card"><EmptyState art="notifications" title="No messages yet" body={canStart.length ? "Start a conversation with someone who follows you:" : "When someone follows you, you can message them here. Post a dispatch to get noticed."} action={canStart.length ? undefined : { label: "Discover people", href: "/explore" }} /></div></div>
      )}
      {canStart.length > 0 && (
        <section aria-labelledby="start" className="px-3 pt-6 sm:px-4">
          <h2 id="start" className="mb-2 text-[11px] font-extrabold tracking-[0.14em] text-ink-3 uppercase">Start a conversation</h2>
          <ul className="scrollbar-none -mx-3 flex gap-2 overflow-x-auto px-3 pb-2">
            {canStart.map((u) => (
              <li key={u.id} className="shrink-0">
                <Link href={`/messages/${u.handle}`} className="card card-hover flex w-[104px] flex-col items-center gap-1.5 px-2 py-3 text-center">
                  <Avatar url={u.avatarUrl} name={u.displayName} handle={u.handle} size={48} />
                  <span className="w-full truncate text-[12.5px] font-bold">{u.displayName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Frame>
  );
}
