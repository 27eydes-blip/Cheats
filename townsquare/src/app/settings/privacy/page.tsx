import { Frame } from "@/components/ui/Frame";
import Link from "next/link";
import { requireViewerPage } from "@/lib/session";
import { listBlockedAndMuted } from "@/lib/social";
import { Avatar } from "@/components/ui/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { Unblock } from "./Unblock";

export const metadata = { title: "Privacy and safety" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await requireViewerPage("/settings/privacy");
  const { blocked, muted } = listBlockedAndMuted(u.id);
  const section = (title: string, list: typeof blocked, kind: "block" | "mute") => (
    <section className="border-b border-line px-4 py-5 sm:px-6">
      <h2 className="font-display text-h3 font-semibold">{title}</h2>
      {list.length === 0 ? (
        <p className="mt-1 text-sm text-ink-3">None.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {list.map((x) => (
            <li key={x.id} className="flex items-center gap-3">
              <Avatar url={x.avatarUrl} name={x.displayName} handle={x.handle} size={36} />
              <Link href={`/u/${x.handle}`} className="min-w-0 flex-1 truncate font-semibold">@{x.handle}</Link>
              <Unblock userId={x.id} kind={kind} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
  return (
    <Frame>
      <PageHeader title="Privacy and safety" back compact />
      <section className="border-b border-line px-4 py-5 sm:px-6">
        <h2 className="font-display text-h3 font-semibold">Your data</h2>
        <p className="mt-1 text-sm text-ink-3">Download everything we store about you as a JSON file: profile, posts, edits, likes, follows, bookmarks, reports, and notifications.</p>
        <a href="/api/export" className="btn-outline mt-3" download>Download my data</a>
      </section>
      <section className="border-b border-line px-4 py-5 sm:px-6">
        <h2 className="font-display text-h3 font-semibold">Follower lists</h2>
        <p className="mt-1 text-sm text-ink-3">{u.hide_follows ? "Hidden from others." : "Visible to everyone."} Change this in <Link href="/settings/account" className="underline">Account</Link>.</p>
      </section>
      {section("Blocked accounts", blocked, "block")}
      {section("Muted accounts", muted, "mute")}
    </Frame>
  );
}
