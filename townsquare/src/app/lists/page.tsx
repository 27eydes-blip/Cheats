import Link from "next/link";
import { listsOf } from "@/lib/lists";
import { requireViewerPage } from "@/lib/session";
import { ChevronRight, LayersIcon } from "@/components/icons";
import { Kicker } from "@/components/ui/Badge";
import { Frame, PageTitle } from "@/components/ui/Frame";
import { NewList } from "./ListControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lists" };

/** Lists: your own private feeds, each built from accounts you choose. */
export default async function Lists() {
  const viewer = await requireViewerPage("/lists");
  const lists = listsOf(viewer.id);
  return (
    <Frame>
      <PageTitle folio={<Kicker tone="gold">Private to you</Kicker>} title="Lists" dek="Build your own feeds: group accounts into a list and read just their dispatches." />
      <div className="space-y-3 px-3 pt-4 sm:px-4">
        <NewList />
        {lists.length === 0 ? (
          <div className="card p-5 text-center">
            <p className="font-display text-[22px] font-extrabold uppercase">No lists yet</p>
            <p className="mt-1 text-[14.5px] text-ink-2">Try one called &ldquo;Hill reporters&rdquo; or &ldquo;Market watchers&rdquo;, then add a few accounts by handle.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {lists.map((l) => (
              <li key={l.id}>
                <Link href={`/lists/${l.id}`} className="card card-hover flex min-h-16 items-center gap-3 px-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[rgb(47_107_255/0.16)] text-[var(--wn-blue-ink)]"><LayersIcon size={20} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[16px] font-bold">{l.name}</span><span className="mono block text-[11.5px] text-ink-3">{l.members} ACCOUNT{l.members === 1 ? "" : "S"}</span></span>
                  <ChevronRight size={18} className="text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Frame>
  );
}
