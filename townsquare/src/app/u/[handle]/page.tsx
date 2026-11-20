import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { credibilityScore } from "@/lib/credibility";
import { earnedAchievements, postingStreak } from "@/lib/achievements";
import { profileFeed, type ProfileTab } from "@/lib/feed";
import { hydrate, liveHostIds } from "@/lib/posts";
import { ACCENTS, BEATS, isAccent, type Beat } from "@/lib/profile-theme";
import { getViewer } from "@/lib/session";
import { isFriend, pinnedIds } from "@/lib/social";
import { debates } from "@/lib/takes";
import { canSeeDispatches, getProfile } from "@/lib/users";
import { Feed } from "@/components/Feed";
import { FollowButton } from "@/components/FollowButton";
import { PostCard } from "@/components/PostCard";
import { DebateCard } from "@/components/front/DebateCard";
import { CalendarIcon, LinkIcon, MapPinIcon, MessageIcon, PinIcon } from "@/components/icons";
import { canMessage } from "@/lib/messages";
import { CredibilityMeter } from "@/components/profile/CredibilityMeter";
import { Avatar } from "@/components/ui/Avatar";
import { LiveBadge, VerifiedSeal } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/States";
import { ProfileMenu } from "./ProfileMenu";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const p = getProfile((await params).handle, null);
  return { title: p ? `${p.displayName} (@${p.handle})` : "Profile not found", description: p?.bio || undefined };
}

const TABS: { key: string; label: string; ptab: ProfileTab | null }[] = [
  { key: "dispatches", label: "Dispatches", ptab: "posts" },
  { key: "responses", label: "Responses", ptab: "replies" },
  { key: "media", label: "Media", ptab: "media" },
  { key: "boosted", label: "Boosted", ptab: "likes" },
  { key: "debates", label: "Debates", ptab: null },
];

/**
 * WorldNet profile: a full-width banner, a left identity panel (who they are,
 * their Beat, Credibility Meter, people), and their dispatches on the right.
 */
export default async function Profile({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ handle }, sp, viewer] = await Promise.all([params, searchParams, getViewer()]);
  const p = getProfile(handle, viewer?.id ?? null);
  if (!p) notFound();
  if (p.viewer.blockedBy) return <EmptyState art="community" title={`You can't view @${p.handle}`} body="This account has limited who can see it." />;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const accent = ACCENTS[isAccent(p.accent) ? p.accent : "blue"];
  const live = liveHostIds().has(p.id);
  const cred = credibilityScore(p.id);
  const streak = postingStreak(p.id);
  const badges = earnedAchievements(p.id);
  const visible = canSeeDispatches(p) && !p.viewer.blocked;
  const friend = viewer && !p.viewer.isSelf ? isFriend(viewer.id, p.id) : false;
  const pins = visible ? hydrate(pinnedIds(p.id), viewer?.id ?? null).filter((x) => !x.gone) : [];
  const vid = viewer?.id ?? null;
  const initial = visible && tab.ptab ? profileFeed(p.id, tab.ptab, vid, null) : { items: [], nextCursor: null };
  const firstPage = tab.key === "dispatches" ? { ...initial, items: initial.items.filter((i) => !pins.some((x) => x.id === i.post.id) || i.repostedBy) } : initial;
  const fights = visible && tab.key === "debates" ? debates(vid, 6, undefined, p.id) : [];
  const joined = new Date(p.joinedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div style={{ ["--accent-c" as string]: accent.color, ["--accent-ink" as string]: accent.ink }}>
      {/* Full-width banner */}
      <div className="relative h-36 overflow-hidden sm:h-48 lg:h-52" style={{ background: p.bannerUrl ? undefined : `radial-gradient(60% 120% at 20% 0%, ${accent.color}aa, transparent 70%), radial-gradient(50% 100% at 90% 30%, rgb(34 211 238 / 0.35), transparent 70%), #0b1430` }}>
        {p.bannerUrl && <img src={p.bannerUrl} alt="" className="h-full w-full object-cover" />}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--paper)]" />
      </div>

      <div className="mx-auto grid max-w-[1200px] gap-6 px-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:px-8">
        {/* Left identity panel */}
        <aside className="-mt-16 min-w-0 lg:-mt-24">
          <div className="card space-y-4 p-5 lg:sticky lg:top-[calc(var(--sub-top)+16px)]" style={{ boxShadow: `0 0 0 1px ${accent.color}55, 0 20px 50px -20px ${accent.color}88` }}>
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-[22px] p-1" style={{ background: `linear-gradient(135deg, ${accent.color}, rgb(34 211 238 / 0.6))` }}>
                <Avatar url={p.avatarUrl} name={p.displayName} handle={p.handle} size={96} live={live} />
              </span>
              {viewer && !p.viewer.isSelf && <ProfileMenu userId={p.id} handle={p.handle} blocked={p.viewer.blocked} muted={p.viewer.muted} />}
            </div>
            <div>
              <h1 className="flex flex-wrap items-center gap-2 font-display text-[clamp(1.8rem,1.5rem+1vw,2.3rem)] leading-none font-extrabold">
                {p.displayName}
                {p.verified && <VerifiedSeal size={24} />}
              </h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[13.5px] text-ink-3">
                <span className="mono">@{p.handle}</span>
                {friend ? (
                  <span className="accent-ink rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-extrabold tracking-[0.1em] uppercase" style={{ background: `${accent.color}26` }}>Friends</span>
                ) : p.viewer.followsYou ? (
                  <span className="rounded-[6px] bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] font-bold tracking-[0.08em] text-ink-2 uppercase">Follows you</span>
                ) : null}
                {p.isPrivate && <span className="rounded-[6px] bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] font-bold tracking-[0.08em] text-ink-2 uppercase">Private</span>}
                {live && <Link href="/live"><LiveBadge /></Link>}
              </p>
            </div>
            {p.bio && <p className="text-[15px] leading-snug text-ink-1">{p.bio}</p>}
            <ul className="space-y-1.5 text-[13.5px] text-ink-2">
              {p.location && <li className="flex items-center gap-2"><MapPinIcon size={15} className="text-ink-3" />{p.location}</li>}
              {p.links.slice(0, 2).map((l) => (
                <li key={l.url} className="flex min-w-0 items-center gap-2"><LinkIcon size={15} className="text-ink-3" /><a href={l.url} target="_blank" rel="noopener noreferrer nofollow me" className="accent-ink truncate font-semibold hover:underline">{l.label || l.url.replace(/^https?:\/\/(www\.)?/, "")}</a></li>
              ))}
              <li className="flex items-center gap-2"><CalendarIcon size={15} className="text-ink-3" />Joined {joined}</li>
            </ul>
            <div className="flex flex-wrap gap-2">
              {p.viewer.isSelf ? (
                <Link href="/settings/profile" className="btn-outline w-full">Edit profile</Link>
              ) : viewer ? (
                !p.viewer.blocked && (
                  <>
                    <span className="min-w-0 flex-1 [&>button]:w-full"><FollowButton userId={p.id} following={p.viewer.follows} requested={p.viewer.requested} /></span>
                    {canMessage(viewer.id, p.id).ok && <Link href={`/messages/${p.handle}`} className="btn-outline" aria-label={`Message ${p.displayName}`}><MessageIcon size={18} /> Message</Link>}
                  </>
                )
              ) : (
                <Link href={`/login?next=/u/${p.handle}`} className="btn-primary w-full">Follow</Link>
              )}
            </div>

            {p.beats.length > 0 && (
              <section aria-labelledby="beat">
                <h2 id="beat" className="mb-2 text-[11px] font-extrabold tracking-[0.14em] text-ink-3 uppercase">Beat</h2>
                <ul className="flex flex-wrap gap-1.5">
                  {p.beats.filter((b): b is Beat => b in BEATS).map((b) => (
                    <li key={b} className="beat-chip rounded-[8px] px-2.5 py-1 text-[12px] font-bold" style={{ ["--c" as string]: BEATS[b].color }}>{BEATS[b].label}</li>
                  ))}
                </ul>
              </section>
            )}

            {(streak > 0 || badges.length > 0) && (
              <section aria-labelledby="ach">
                <h2 id="ach" className="mb-2 text-[11px] font-extrabold tracking-[0.14em] text-ink-3 uppercase">Achievements</h2>
                <ul className="flex flex-wrap gap-1.5">
                  {streak > 0 && <li className="amber-ink inline-flex min-h-8 items-center gap-1 rounded-[8px] bg-[rgb(34_211_238/0.12)] px-2 text-[12.5px] font-extrabold ring-1 ring-[#22d3ee]/40" title={`${streak}-day posting streak`}>🔥 {streak}-day streak</li>}
                  {badges.map((b) => (
                    <li key={b.key} title={`${b.label}: ${b.text}`} className="inline-flex min-h-8 items-center gap-1 rounded-[8px] bg-white/[0.04] px-2 text-[12.5px] font-semibold ring-1 ring-rule"><span aria-hidden="true">{b.emoji}</span>{b.label}</li>
                  ))}
                </ul>
              </section>
            )}

            <CredibilityMeter c={cred} accent={accent.color} />

            {p.followers !== null && (
              <nav aria-label="People" className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["Followers", p.followers, `/u/${p.handle}/followers`],
                  ["Following", p.following, `/u/${p.handle}/following`],
                  ["Friends", p.friends, `/u/${p.handle}/friends`],
                ].map(([label, n, href]) => (
                  <Link key={String(label)} href={String(href)} className="rounded-[12px] bg-white/[0.03] px-1 py-2.5 ring-1 ring-rule transition-all hover:ring-[var(--accent-c)]">
                    <span className="block font-display text-[22px] leading-none font-extrabold">{Number(n).toLocaleString("en-US")}</span>
                    <span className="mt-1 block text-[11px] font-bold tracking-[0.08em] text-ink-3 uppercase">{label}</span>
                  </Link>
                ))}
              </nav>
            )}
            {p.status === "suspended" && <p className="rounded-[10px] bg-danger-soft px-3 py-2 text-[13.5px] text-disagree">This account is suspended.</p>}
          </div>
        </aside>

        {/* Right: pinned + tabs */}
        <main className="relative z-10 min-w-0 pt-2 lg:-mt-14 lg:pt-0">
          {!visible ? (
            <div className="card p-6 text-center">
              <p className="font-display text-[24px] font-extrabold uppercase">{p.viewer.blocked ? `You blocked @${p.handle}` : "This account is private"}</p>
              <p className="mt-2 text-[14.5px] text-ink-2">{p.viewer.blocked ? "Unblock from the ••• menu to see their dispatches." : "Only approved followers see their dispatches. Follow to send a request."}</p>
            </div>
          ) : (
            <>
              {pins.length > 0 && tab.key === "dispatches" && (
                <section aria-labelledby="pins" className="mb-5">
                  <h2 id="pins" className="accent-ink mb-2 flex items-center gap-2 text-[11px] font-extrabold tracking-[0.14em] uppercase"><PinIcon size={14} /> Pinned</h2>
                  <div className="card divide-y divide-rule overflow-hidden" style={{ boxShadow: `inset 3px 0 0 ${accent.color}` }}>
                    {pins.map((x) => <PostCard key={x.id} post={x} />)}
                  </div>
                </section>
              )}
              <nav role="tablist" aria-label="Profile" className="card scrollbar-none sticky top-[calc(var(--sub-top)+8px)] z-20 flex gap-1 overflow-x-auto p-1">
                {TABS.map((t) => (
                  <Link key={t.key} role="tab" aria-selected={t.key === tab.key} href={t.key === "dispatches" ? `/u/${p.handle}` : `/u/${p.handle}?tab=${t.key}`} scroll={false}
                    className={`flex h-10 min-w-[96px] flex-1 items-center justify-center rounded-[10px] px-3 text-[13px] font-bold tracking-[0.04em] uppercase transition-all ${t.key === tab.key ? "text-white" : "text-ink-2 hover:bg-white/[0.05] hover:text-ink-1"}`}
                    style={t.key === tab.key ? { background: accent.color, color: "#04070f" } : undefined}>
                    {t.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-3">
                {tab.key === "debates" ? (
                  <div className="card overflow-hidden">{fights.length ? <div className="grid gap-6 p-4">{fights.map((d) => <DebateCard key={d.left.id} d={d} />)}</div> : <EmptyState art="community" title="No debates yet" body="When someone responds to a dispatch with the opposite stance, the exchange lands here." />}</div>
                ) : (
                  <Feed
                    key={tab.key}
                    pad={false}
                    initial={firstPage}
                    source={{ tab: "profile", handle: p.handle, ptab: tab.ptab! }}
                    prependOwn={p.viewer.isSelf && tab.key === "dispatches"}
                    empty={
                      <EmptyState
                        art="feed"
                        title={{ dispatches: "No dispatches yet", responses: "No responses yet", media: "No photos yet", boosted: "Nothing boosted yet" }[tab.key as "dispatches"]}
                        body={p.viewer.isSelf ? { dispatches: "File your first dispatch. Tip: add a source link to raise your Credibility.", responses: "Respond to a dispatch and it lands here.", media: "Dispatches with photos show up here.", boosted: "React to dispatches you rate and they collect here." }[tab.key as "dispatches"] : "Check back soon."}
                        action={p.viewer.isSelf && tab.key === "dispatches" ? { label: "Find a story", href: "/" } : undefined}
                      />
                    }
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
