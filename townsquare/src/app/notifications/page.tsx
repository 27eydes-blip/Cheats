import Link from "next/link";
import { listNotifications, NOTIFICATION_FILTERS, type NotificationView } from "@/lib/notifications";
import { requireViewerPage } from "@/lib/session";
import { Avatar } from "@/components/ui/Avatar";
import { ChipLink, ChipRow } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/States";
import { HeartIcon, QuoteIcon, ReplyIcon, RepostIcon, ShieldIcon, UserIcon } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";
import { Time } from "@/components/Time";
import { MarkRead } from "./MarkRead";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

const LABELS: Record<keyof typeof NOTIFICATION_FILTERS, string> = { all: "All", mentions: "Mentions", likes: "Likes", reposts: "Reposts", follows: "Follows", account: "Account" };

type Group = { key: string; type: NotificationView["type"]; actors: NonNullable<NotificationView["actor"]>[]; first: NotificationView; read: boolean };

/** Likes, reposts, and follows on the same thing collapse into one row ("Maria and 3 others liked…"). */
function group(items: NotificationView[]): Group[] {
  const out: Group[] = [];
  const map = new Map<string, Group>();
  for (const n of items) {
    const groupable = n.type === "like" || n.type === "repost" || n.type === "follow";
    const key = groupable ? `${n.type}:${n.postId ?? ""}:${n.read ? "r" : "u"}` : n.id;
    let g = map.get(key);
    if (!g) {
      g = { key, type: n.type, actors: [], first: n, read: n.read };
      map.set(key, g);
      out.push(g);
    }
    if (n.actor && !g.actors.some((a) => a.id === n.actor!.id)) g.actors.push(n.actor);
  }
  return out;
}

const VERB: Partial<Record<NotificationView["type"], string>> = { like: "liked your post", repost: "reposted your post", follow: "followed you", reply: "replied to you", quote: "quoted your post", mention: "mentioned you" };

function Icon({ type }: { type: NotificationView["type"] }) {
  const wrap = (cls: string, node: React.ReactNode) => <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${cls}`}>{node}</span>;
  if (type === "like") return wrap("bg-rose-500/12 text-rose-600 dark:text-rose-400", <HeartIcon filled size={18} />);
  if (type === "repost") return wrap("bg-success/12 text-success", <RepostIcon size={18} />);
  if (type === "follow") return wrap("bg-accent-soft text-accent", <UserIcon size={18} />);
  if (type === "quote") return wrap("bg-accent-soft text-accent", <QuoteIcon size={18} />);
  if (type === "warning" || type === "system") return wrap("bg-danger-soft text-danger", <ShieldIcon size={18} />);
  return wrap("bg-accent-soft text-accent", <ReplyIcon size={18} />);
}

function Row({ g }: { g: Group }) {
  const n = g.first;
  const href = n.postId ? `/p/${n.postId}` : g.actors[0] ? `/u/${g.actors[0].handle}` : "#";
  const names = g.actors.length === 0 ? null : g.actors.length === 1 ? <b>{g.actors[0].displayName}</b> : <><b>{g.actors[0].displayName}</b> and {g.actors.length - 1} other{g.actors.length > 2 ? "s" : ""}</>;
  return (
    <li>
      <Link href={href} className={`flex gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2/50 sm:px-6 ${g.read ? "" : "bg-accent-soft/50"}`}>
        <Icon type={g.type} />
        <div className="min-w-0 flex-1">
          {g.actors.length > 0 && (
            <div className="mb-1.5 flex -space-x-2">
              {g.actors.slice(0, 6).map((a) => <Avatar key={a.id} url={a.avatarUrl} name={a.displayName} handle={a.handle} size={30} ring={false} className="ring-2 ring-surface" />)}
            </div>
          )}
          <p className="text-[15px] leading-snug">
            {names ? <>{names} {VERB[g.type]}</> : <b>{g.type === "warning" ? "Moderation team" : "Townsquare"}</b>}
            <span className="text-ink-3"> · <Time ms={n.createdAt} /></span>
          </p>
          {n.message && <p className="mt-1 text-[14.5px] text-ink-2">{n.message}</p>}
          {n.postSnippet && n.type !== "warning" && <p className="mt-1 line-clamp-2 text-[14.5px] text-ink-3">{n.postSnippet}</p>}
        </div>
        {!g.read && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent-grad" aria-label="Unread" />}
      </Link>
    </li>
  );
}

export default async function Notifications({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const viewer = await requireViewerPage("/notifications");
  const f = ((await searchParams).f ?? "all") as keyof typeof NOTIFICATION_FILTERS;
  const filter = f in NOTIFICATION_FILTERS ? f : "all";
  const groups = group(listNotifications(viewer.id, filter, 120));
  const fresh = groups.filter((g) => !g.read);
  const earlier = groups.filter((g) => g.read);
  return (
    <>
      {fresh.length > 0 && <MarkRead />}
      <PageHeader title="Notifications" subtitle={fresh.length ? `${fresh.length} new` : "You're all caught up"}>
        <div className="py-2.5">
          <ChipRow label="Filter notifications">
            {Object.entries(LABELS).map(([k, v]) => (
              <ChipLink key={k} href={k === "all" ? "/notifications" : `/notifications?f=${k}`} active={k === filter}>{v}</ChipLink>
            ))}
          </ChipRow>
        </div>
      </PageHeader>
      {groups.length === 0 ? (
        <EmptyState art="notifications" title="Nothing here yet" body="When people follow, like, reply, or mention you, it shows up here." />
      ) : (
        <>
          {fresh.length > 0 && (
            <section aria-label="New">
              <h2 className="kicker px-4 pt-4 pb-1 text-accent sm:px-6">New</h2>
              <ul className="divide-y divide-line">{fresh.map((g) => <Row key={g.key} g={g} />)}</ul>
            </section>
          )}
          {earlier.length > 0 && (
            <section aria-label="Earlier">
              <h2 className="kicker px-4 pt-5 pb-1 text-ink-3 sm:px-6">Earlier</h2>
              <ul className="divide-y divide-line">{earlier.map((g) => <Row key={g.key} g={g} />)}</ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
