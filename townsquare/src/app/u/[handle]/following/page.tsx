import { Frame } from "@/components/ui/Frame";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/session";
import { listFollows } from "@/lib/social";
import { canSeeDispatches, getProfile, userByHandle } from "@/lib/users";
import { PageHeader } from "@/components/PageHeader";
import { PeopleTabs } from "@/components/profile/PeopleTabs";
import { UserList } from "@/components/UserList";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const viewer = await getViewer();
  const u = userByHandle(handle);
  if (!u) notFound();
  const p = getProfile(u.handle, viewer?.id ?? null);
  if (p && !canSeeDispatches(p)) return <Frame><PageHeader title={u.display_name} subtitle={`@${u.handle}`} back /><p className="px-6 py-16 text-center text-ink-3">@{u.handle} is private. Only approved followers see this list.</p></Frame>;
  const list = listFollows(u.id, "following", viewer?.id ?? null);
  return (
    <Frame>
      <PageHeader title={u.display_name} subtitle={`@${u.handle}`} back>
        <PeopleTabs handle={u.handle} active="following" />
      </PageHeader>
      {list === "hidden" ? <p className="px-6 py-16 text-center text-ink-3">@{u.handle} keeps this list private.</p> : <UserList users={list ?? []} />}
    </Frame>
  );
}
