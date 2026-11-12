import Link from "next/link";
import { createCity } from "../../actions";
import { Card, Flash } from "@/components/admin";
import { CityFields } from "@/components/CityForm";
import { accessLabel, formatMoney, type City } from "@/lib/db";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function Cities({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const env = await getEnv();
  const { results } = await env.DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM listings l JOIN sections s ON s.id=l.section_id WHERE s.city_id=c.id) AS listings
     FROM cities c ORDER BY name`,
  ).all<City & { listings: number }>();
  return (
    <>
      <Flash sp={sp} />
      <Card title="Cities">
        <ul className="divide-y divide-line">
          {results.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <Link href={`/admin/cities/${c.id}`} className="font-serif text-lg text-white hover:text-gold">
                {c.name}, {c.state}
              </Link>
              <span className="text-sm text-muted">
                {c.listings} listings · {formatMoney(c.price_cents)} {accessLabel(c)} · {c.published ? <span className="text-open">published</span> : <span className="text-closing">hidden</span>} ·{" "}
                <a href={`/city/${c.slug}`} target="_blank" className="text-gold underline">
                  view
                </a>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Add a city">
        <p className="mb-4 text-sm text-muted">New cities start hidden with the six standard sections. Add listings, verify them, then publish.</p>
        <form action={createCity}>
          <CityFields />
        </form>
      </Card>
    </>
  );
}
