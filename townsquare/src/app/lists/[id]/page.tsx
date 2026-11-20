import { notFound } from "next/navigation";
import { getList, listFeed } from "@/lib/lists";
import { requireViewerPage } from "@/lib/session";
import { Feed } from "@/components/Feed";
import { PageHeader } from "@/components/PageHeader";
import { Frame } from "@/components/ui/Frame";
import { EmptyState } from "@/components/ui/States";
import { ListMembers } from "../ListControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "List" };

export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewerPage(`/lists/${id}`);
  const list = getList(viewer.id, id);
  if (!list) notFound();
  return (
    <Frame>
      <PageHeader title={list.name} subtitle={`${list.members.length} account${list.members.length === 1 ? "" : "s"} · private list`} back compact />
      <div className="px-3 pb-3 sm:px-4"><ListMembers listId={list.id} members={list.members} /></div>
      <Feed
        initial={listFeed(viewer.id, id)}
        source={{ tab: "list", list: id }}
        empty={<EmptyState art="feed" title={list.members.length ? "No dispatches yet" : "Add your first account"} body={list.members.length ? "When the accounts in this list post, their dispatches show up here." : "Type a handle above (for example @maria_lopez) to start this feed."} />}
      />
    </Frame>
  );
}
