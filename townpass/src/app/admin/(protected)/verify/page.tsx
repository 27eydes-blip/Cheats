import Link from "next/link";
import { markVerified } from "../../actions";
import { Card, fmtDate } from "@/components/admin";
import { STALE_DAYS } from "@/lib/db";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function Verify() {
  const env = await getEnv();
  const { results } = await env.DB.prepare(
    `SELECT l.id, l.name, l.verified, l.last_verified_at, s.title AS section, c.name AS city
     FROM listings l JOIN sections s ON s.id = l.section_id JOIN cities c ON c.id = s.city_id
     WHERE l.active = 1 AND (l.verified = 0 OR l.last_verified_at IS NULL OR l.last_verified_at < ?)
     ORDER BY l.verified, COALESCE(l.last_verified_at, 0), c.name, s.sort`,
  )
    .bind(Date.now() - STALE_DAYS * 86_400_000)
    .all<{ id: number; name: string; verified: number; last_verified_at: number | null; section: string; city: string }>();

  return (
    <Card title={`Needs verification (${results.length})`}>
      <p className="mb-4 text-sm text-muted">
        Unverified placeholders and anything not verified in the last {STALE_DAYS} days. Open a listing to fix details, or tap “still
        correct” after you’ve confirmed it (call, visit, or check the official site).
      </p>
      {results.length === 0 && <p className="text-open">All caught up ✓</p>}
      <ul className="divide-y divide-line">
        {results.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span>
              <Link href={`/admin/listings/${l.id}`} className="text-white hover:text-gold">
                {l.name}
              </Link>
              <span className="ml-2 text-xs text-muted">
                {l.city} · {l.section}
              </span>
            </span>
            <span className="flex items-center gap-3 text-xs">
              {l.verified ? <span className="text-closing">last {fmtDate(l.last_verified_at)}</span> : <span className="font-semibold text-closing">UNVERIFIED</span>}
              <form action={markVerified}>
                <input type="hidden" name="id" value={l.id} />
                <input type="hidden" name="back" value="/admin/verify" />
                <button className="rounded bg-panel-2 px-2 py-1 ring-1 ring-line hover:text-gold">still correct ✓</button>
              </form>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
