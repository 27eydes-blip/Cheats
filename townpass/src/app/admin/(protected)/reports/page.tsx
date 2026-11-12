import Link from "next/link";
import { setReportStatus } from "../../actions";
import { Card, fmtDateTime } from "@/components/admin";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

type Row = { id: number; message: string; status: string; created_at: number; listing_id: number; listing: string; city: string };

export default async function Reports() {
  const env = await getEnv();
  const q = (status: string) =>
    env.DB.prepare(
      `SELECT r.*, l.name AS listing, c.name AS city FROM reports r
       JOIN listings l ON l.id = r.listing_id JOIN sections s ON s.id = l.section_id JOIN cities c ON c.id = s.city_id
       WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 200`,
    ).bind(status);
  const [open, resolved] = await env.DB.batch([q("open"), q("resolved")]);
  return (
    <>
      <Card title={`Open reports (${open.results.length})`}>
        <List rows={open.results as Row[]} />
      </Card>
      <Card title="Recently resolved">
        <List rows={(resolved.results as Row[]).slice(0, 30)} />
      </Card>
    </>
  );
}

function List({ rows }: { rows: Row[] }) {
  if (!rows.length) return <p className="text-sm text-muted">None.</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <Link href={`/admin/listings/${r.listing_id}`} className="text-gold hover:underline">
              {r.listing}
            </Link>
            <span className="ml-2 text-xs text-muted">
              {r.city} · {fmtDateTime(r.created_at)}
            </span>
            <p className="mt-1 whitespace-pre-line text-sm text-zinc-200">{r.message}</p>
          </div>
          <form action={setReportStatus}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="status" value={r.status === "open" ? "resolved" : "open"} />
            <button className="rounded bg-panel-2 px-2 py-1 text-xs ring-1 ring-line hover:text-gold">{r.status === "open" ? "Resolve" : "Reopen"}</button>
          </form>
        </li>
      ))}
    </ul>
  );
}
