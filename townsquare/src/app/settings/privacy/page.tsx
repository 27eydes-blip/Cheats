import Link from "next/link";
import { requireViewerPage } from "@/lib/session";
import { listBlockedAndMuted } from "@/lib/social";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { Unblock } from "./Unblock";

export const metadata = { title: "Privacy and safety" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await requireViewerPage("/settings/privacy");
  const { blocked, muted } = listBlockedAndMuted(u.id);
  const section = (title: string, list: typeof blocked, kind: "block" | "mute") => (
    <section className="border-b border-line p-4">
      <h2 className="text-lg font-extrabold">{title}</h2>
      {list.length === 0 ? (
        <p className="mt-1 text-sm text-muted">None.</p>
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
    <>
      <PageHeader title="Privacy and safety" back />
      <section className="border-b border-line p-4">
        <h2 className="text-lg font-extrabold">Your data</h2>
        <p className="mt-1 text-sm text-muted">Download everything we store about you as a JSON file: profile, posts, edits, likes, follows, bookmarks, reports, and notifications.</p>
        <a href="/api/export" className="btn-outline mt-3" download>Download my data</a>
      </section>
      <section className="border-b border-line p-4">
        <h2 className="text-lg font-extrabold">Follower lists</h2>
        <p className="mt-1 text-sm text-muted">{u.hide_follows ? "Hidden from others." : "Visible to everyone."} Change this in <Link href="/settings/account" className="underline">Account</Link>.</p>
      </section>
      {section("Blocked accounts", blocked, "block")}
      {section("Muted accounts", muted, "mute")}
    </>
  );
}
