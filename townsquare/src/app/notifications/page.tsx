import { AiBadge } from "@/components/ui/Badge";
import { APP_SHORT } from "@/config";
import Link from "next/link";
import { listNotifications, NOTIFICATION_FILTERS, type NotificationView } from "@/lib/notifications";
import { requireViewerPage } from "@/lib/session";
import { Avatar } from "@/components/ui/Avatar";
import { ChipLink, ChipRow } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/States";
import { AgreeIcon, AmplifyIcon, AnswerIcon, FlameIcon, QuoteIcon, ShieldIcon, SparkIcon, UserIcon } from "@/components/icons";
import { RequestButtons } from "./RequestButtons";
import { Suggestions } from "@/components/social/Suggestions";
import { suggestFriends } from "@/lib/social";
import { FollowerCelebrate } from "./FollowerCelebrate";
import { Kicker } from "@/components/ui/Badge";
import { Frame, PageTitle } from "@/components/ui/Frame";
import { all } from "@/lib/db";
import { Time } from "@/components/Time";
import { MarkRead } from "./MarkRead";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

const LABELS: Record<keyof typeof NOTIFICATION_FILTERS, string> = { all: "Everything", mentions: "Responses & mentions", likes: "Reactions", reposts: "Relays", follows: "Followers", account: "Standards" };

type Group = { key: string; type: NotificationView["type"]; actors: NonNullable<NotificationView["actor"]>[]; first: NotificationView; read: boolean };

/** Likes, reposts, and follows on the same thing collapse into one row ("Maria and 3 others liked…"). */
function group(items: NotificationView[]): Group[] {
  const out: Group[] = [];
  const map = new Map<string, Group>();
  for (const n of items) {
    const groupable = n.type === "like" || n.type === "reaction" || n.type === "repost" || n.type === "follow";
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

const VERB: Partial<Record<NotificationView["type"], string>> = {
  like: "boosted your dispatch", reaction: "reacted to your dispatch", repost: "relayed your dispatch", follow: "started following you", reply: "responded to you",
  quote: "quoted your dispatch", mention: "mentioned you", follow_request: "asked to follow you", follow_accept: "approved your follow request",
};

function Icon({ type }: { type: NotificationView["type"] }) {
  const wrap = (cls: string, node: React.ReactNode) => <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${cls}`}>{node}</span>;
  if (type === "like") return wrap("bg-agree/10 text-agree", <AgreeIcon size={18} />);
  if (type === "repost") return wrap("bg-gold-soft text-gold-ink", <AmplifyIcon size={18} />);
  if (type === "follow" || type === "follow_request" || type === "follow_accept") return wrap("bg-navy-soft text-navy-ink", <UserIcon size={18} />);
  if (type === "reaction") return wrap("bg-[rgb(34_211_238/0.14)] text-[#22d3ee]", <SparkIcon size={18} />);
  if (type === "achievement") return wrap("bg-[rgb(34_211_238/0.14)] text-[var(--wn-cyan-ink)]", <FlameIcon size={18} />);
  if (type === "quote") return wrap("bg-navy-soft text-navy-ink", <QuoteIcon size={18} />);
  if (type === "warning" || type === "system") return wrap("bg-danger-soft text-disagree", <ShieldIcon size={18} />);
  return wrap("bg-navy-soft text-navy-ink", <AnswerIcon size={18} />);
}

function Row({ g }: { g: Group }) {
  const n = g.first;
  if (g.type === "follow_request" && g.actors[0]) {
    const a = g.actors[0];
    return (
      <li className={`flex gap-3 px-4 py-3.5 sm:px-6 ${g.read ? "" : "bg-gold-soft/60 shadow-[inset_3px_0_0_var(--gold)]"}`}>
        <Icon type={g.type} />
        <div className="min-w-0 flex-1">
          <Link href={`/u/${a.handle}`} className="flex items-center gap-2"><Avatar url={a.avatarUrl} name={a.displayName} handle={a.handle} size={28} /><span className="text-[15px]"><b>{a.displayName}</b>{a.ai && <> <AiBadge className="align-[2px]" /></>} {VERB.follow_request}</span></Link>
          <RequestButtons requesterId={a.id} />
        </div>
      </li>
    );
  }
  const href = n.postId ? `/p/${n.postId}` : g.actors[0] ? `/u/${g.actors[0].handle}` : "#";
  const first = g.actors[0] ? <><b>{g.actors[0].displayName}</b>{g.actors[0].ai && <> <AiBadge className="align-[2px]" /></>}</> : null;
  const names = g.actors.length === 0 ? null : g.actors.length === 1 ? first : <>{first} and {g.actors.length - 1} other{g.actors.length > 2 ? "s" : ""}</>;
  return (
    <li>
      <Link href={href} className={`flex gap-3 px-4 py-3.5 transition-colors hover:bg-paper-2 sm:px-6 ${g.read ? "" : "bg-gold-soft/60 shadow-[inset_3px_0_0_var(--gold)]"}`}>
        <Icon type={g.type} />
        <div className="min-w-0 flex-1">
          {g.actors.length > 0 && (
            <div className="mb-1.5 flex gap-1">
              {g.actors.slice(0, 6).map((a) => <Avatar key={a.id} url={a.avatarUrl} name={a.displayName} handle={a.handle} size={28} />)}
            </div>
          )}
          <p className="text-[15px] leading-snug">
            {names ? <>{names} {VERB[g.type]}</> : <b>{g.type === "warning" ? "Standards desk" : g.type === "achievement" ? "Milestone" : APP_SHORT}</b>}
            <span className="mono text-[11px] text-ink-3"> · <Time ms={n.createdAt} /></span>
          </p>
          {n.message && <p className="mt-1 text-[14.5px] text-ink-2">{n.message}</p>}
          {n.postSnippet && n.type !== "warning" && <p className="mt-1 line-clamp-2 text-[14.5px] text-ink-3">{n.postSnippet}</p>}
        </div>
        {!g.read && <span className="mt-1.5 h-2 w-2 shrink-0 bg-gold" aria-label="New" />}
      </Link>
    </li>
  );
}

export default async function Notifications({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const viewer = await requireViewerPage("/notifications");
  const f = ((await searchParams).f ?? "all") as keyof typeof NOTIFICATION_FILTERS;
  const filter = f in NOTIFICATION_FILTERS ? f : "all";
  const groups = group(listNotifications(viewer.id, filter, 120));
  // Group the inbox by Story, newsroom style; everything else lands under "Your byline".
  const ids = [...new Set(groups.flatMap((g) => (g.first.postId ? [g.first.postId] : [])))];
  const storyOf = new Map(
    ids.length
      ? all<{ id: string; key: string; title: string }>(`SELECT p.id, s.key, s.title FROM posts p JOIN stories s ON s.key = p.story_key WHERE p.id IN (${ids.map(() => "?").join(",")})`, ids).map((r) => [r.id, { key: r.key, title: r.title }])
      : [],
  );
  const desks = new Map<string, { title: string; key: string | null; items: Group[] }>();
  for (const g of groups) {
    const st = g.first.postId ? storyOf.get(g.first.postId) : undefined;
    const k = st?.key ?? "_byline";
    if (!desks.has(k)) desks.set(k, { title: st?.title ?? "You", key: st?.key ?? null, items: [] });
    desks.get(k)!.items.push(g);
  }
  const fresh = groups.filter((g) => !g.read);
  const newFollows = fresh.filter((g) => g.type === "follow").flatMap((g) => g.actors);
  return (
    <Frame>
      {fresh.length > 0 && <MarkRead />}
      {newFollows.length > 0 && <FollowerCelebrate id={newFollows.map((a) => a.id).join(",")} text={`${newFollows[0].displayName}${newFollows.length > 1 ? ` and ${newFollows.length - 1} more` : ""} followed you`} />}
      <PageTitle folio={<Kicker tone="gold">Inbox</Kicker>} title="Newsdesk" dek={fresh.length ? `${fresh.length} new, grouped by story.` : "You're all caught up."} />
      <p className="px-4 pt-2 text-[13.5px] sm:px-6"><Link href="/settings/alerts" className="text-[var(--wn-blue-ink)] underline">Get push alerts on this device</Link></p>
      <div className="sticky-sub z-20 border-b border-rule bg-paper px-4 py-2.5 sm:px-6">
        <ChipRow label="Filter the Newsdesk">
          {Object.entries(LABELS).map(([k, v]) => <ChipLink key={k} href={k === "all" ? "/notifications" : `/notifications?f=${k}`} active={k === filter}>{v}</ChipLink>)}
        </ChipRow>
      </div>
      {groups.length === 0 ? (
        <div className="pb-6">
          <EmptyState art="notifications" title="Quiet on the desk" body="When people follow you, react, respond or mention you, it lands here, filed by story. Following a few people is the fastest way to get the conversation going:" />
          <div className="mx-4 sm:mx-6"><Suggestions people={suggestFriends(viewer.id, 3)} /></div>
        </div>
      ) : (
        [...desks.values()].map((d) => (
          <section key={d.key ?? "byline"} aria-label={d.title} className="mt-6">
            <div className="mx-4 flex items-baseline justify-between gap-3 border-b-2 border-navy-ink pb-1.5 sm:mx-6">
              {d.key ? <Link href={`/news/story/${d.key}`} className="min-w-0 truncate font-display text-[19px] font-semibold hover:underline">{d.title}</Link> : <h2 className="font-display text-[19px] font-semibold">{d.title}</h2>}
              <span className="mono shrink-0 text-[11px] text-ink-3">{d.items.length}</span>
            </div>
            <ul className="divide-y divide-rule">{d.items.map((g) => <Row key={g.key} g={g} />)}</ul>
          </section>
        ))
      )}
    </Frame>
  );
}
