import { notFound } from "next/navigation";
import { getViewer } from "@/lib/session";
import { listFriends } from "@/lib/social";
import { canSeeDispatches, getProfile } from "@/lib/users";
import { PageHeader } from "@/components/PageHeader";
import { PeopleTabs } from "@/components/profile/PeopleTabs";
import { UserList } from "@/components/UserList";
import { Frame } from "@/components/ui/Frame";
import { EmptyState } from "@/components/ui/States";

export const dynamic = "force-dynamic";
export const metadata = { title: "Friends" };

/** Friends: people who follow each other. */
export default async function Page({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const viewer = await getViewer();
  const p = getProfile(handle, viewer?.id ?? null);
  if (!p) notFound();
  const hidden = p.friends === null || !canSeeDispatches(p);
  const list = hidden ? [] : listFriends(p.id, viewer?.id ?? null);
  return (
    <Frame>
      <PageHeader title={p.displayName} subtitle={`@${p.handle}`} back>
        <PeopleTabs handle={p.handle} active="friends" />
      </PageHeader>
      {hidden ? (
        <p className="px-6 py-16 text-center text-ink-3">@{p.handle} keeps this list private.</p>
      ) : list.length ? (
        <UserList users={list} />
      ) : (
        <EmptyState art="community" title="No Friends yet" body="When two people follow each other, they show up here as Friends." action={{ label: "Find people", href: "/explore" }} />
      )}
    </Frame>
  );
}
