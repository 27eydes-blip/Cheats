import { listCommunities } from "@/lib/news";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Communities" };

export default function Communities() {
  const list = listCommunities();
  return (
    <>
      <PageHeader title="Communities" subtitle="Topic groups with voting and threads — coming in Stage 2" />
      <ul>
        {list.map((c) => (
          <li key={c.id} className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-lg font-black text-accent">{c.name[0]}</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">c/{c.slug}</p>
              <p className="line-clamp-2 text-[15px] text-muted">{c.description}</p>
              <p className="text-xs text-muted">{c.members.toLocaleString()} members · {c.visibility}</p>
            </div>
            <button type="button" className="btn-outline min-h-9 px-3 text-sm" disabled title="Joining opens in Stage 2">Join</button>
          </li>
        ))}
      </ul>
    </>
  );
}
