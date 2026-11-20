import { notFound } from "next/navigation";
import { getViewer } from "@/lib/session";
import { listFollows } from "@/lib/social";
import { userByHandle } from "@/lib/users";
import { PageHeader, Tabs } from "@/components/PageHeader";
import { UserList } from "@/components/UserList";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const viewer = await getViewer();
  const u = userByHandle(handle);
  if (!u) notFound();
  const list = listFollows(u.id, "following", viewer?.id ?? null);
  return (
    <>
      <PageHeader title={u.display_name} subtitle={`@${u.handle}`} back>
        <Tabs active="following" tabs={[{ key: "followers", label: "Followers", href: `/u/${u.handle}/followers` }, { key: "following", label: "Following", href: `/u/${u.handle}/following` }]} />
      </PageHeader>
      {list === "hidden" ? <p className="px-6 py-16 text-center text-ink-3">@{u.handle} keeps this list private.</p> : <UserList users={list ?? []} />}
    </>
  );
}
