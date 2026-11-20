import Link from "next/link";
import { listNotifications, NOTIFICATION_FILTERS, type NotificationView } from "@/lib/notifications";
import { requireViewerPage } from "@/lib/session";
import { Avatar } from "@/components/Avatar";
import { BellIcon, HeartIcon, ReplyIcon, RepostIcon, ShieldIcon, UserIcon, QuoteIcon } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";
import { Time } from "@/components/Time";
import { MarkRead } from "./MarkRead";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

const LABELS: Record<keyof typeof NOTIFICATION_FILTERS, string> = { all: "All", mentions: "Mentions", likes: "Likes", reposts: "Reposts", follows: "Follows", account: "Account" };

function line(n: NotificationView) {
  switch (n.type) {
    case "like": return "liked your post";
    case "reply": return "replied to you";
    case "repost": return "reposted your post";
    case "quote": return "quoted your post";
    case "follow": return "followed you";
    case "mention": return "mentioned you";
    default: return "";
  }
}

function Icon({ type }: { type: NotificationView["type"] }) {
  const c = "shrink-0 mt-1";
  if (type === "like") return <HeartIcon filled className={`${c} text-rose-600`} />;
  if (type === "repost") return <RepostIcon className={`${c} text-success`} />;
  if (type === "follow") return <UserIcon className={`${c} text-accent`} />;
  if (type === "quote") return <QuoteIcon className={`${c} text-accent`} />;
  if (type === "warning" || type === "system") return <ShieldIcon className={`${c} text-danger`} />;
  if (type === "reply" || type === "mention") return <ReplyIcon className={`${c} text-accent`} />;
  return <BellIcon className={c} />;
}

export default async function Notifications({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const viewer = await requireViewerPage("/notifications");
  const f = ((await searchParams).f ?? "all") as keyof typeof NOTIFICATION_FILTERS;
  const filter = f in NOTIFICATION_FILTERS ? f : "all";
  const items = listNotifications(viewer.id, filter);
  return (
    <>
      {items.some((n) => !n.read) && <MarkRead />}
      <PageHeader title="Notifications">
        <nav aria-label="Filter notifications" className="flex gap-2 overflow-x-auto px-4 pb-3">
          {Object.entries(LABELS).map(([k, v]) => (
            <Link key={k} href={k === "all" ? "/notifications" : `/notifications?f=${k}`} aria-current={k === filter ? "page" : undefined}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${k === filter ? "border-fg bg-fg text-bg" : "border-line"}`}>
              {v}
            </Link>
          ))}
        </nav>
      </PageHeader>
      {items.length === 0 ? (
        <p className="px-6 py-16 text-center text-muted">Nothing here yet. When people interact with you, you&apos;ll see it here.</p>
      ) : (
        <ul>
          {items.map((n) => {
            const href = n.postId ? `/p/${n.postId}` : n.actor ? `/u/${n.actor.handle}` : "#";
            return (
              <li key={n.id} className={`border-b border-line ${n.read ? "" : "bg-accent-soft/60"}`}>
                <Link href={href} className="flex gap-3 px-4 py-3 hover:bg-surface">
                  <Icon type={n.type} />
                  <div className="min-w-0 flex-1">
                    {n.actor && <Avatar url={n.actor.avatarUrl} name={n.actor.displayName} handle={n.actor.handle} size={32} />}
                    <p className="mt-1 text-[15px]">
                      {n.actor ? <><b>{n.actor.displayName}</b> {line(n)}</> : <b>{n.type === "warning" ? "Moderation team" : "System"}</b>}
                      <span className="text-muted"> · <Time ms={n.createdAt} /></span>
                    </p>
                    {n.message && <p className="mt-1 text-[15px]">{n.message}</p>}
                    {n.postSnippet && n.type !== "warning" && <p className="mt-1 line-clamp-2 text-[15px] text-muted">{n.postSnippet}</p>}
                  </div>
                  {!n.read && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
