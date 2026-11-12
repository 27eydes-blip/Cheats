import Link from "next/link";
import { notFound } from "next/navigation";
import { createSection, markVerified, updateCity, updateSection } from "../../../actions";
import { Btn, Card, Field, Flash, fmtDate } from "@/components/admin";
import { CityFields } from "@/components/CityForm";
import { getCityById, getGuide, isStale } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { SECTION_TYPES, sectionType } from "@/lib/sections";

export const dynamic = "force-dynamic";

export default async function CityAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const env = await getEnv();
  const city = await getCityById(env.DB, Number(id));
  if (!city) notFound();
  const guide = await getGuide(env.DB, city.id, true);
  const back = `/admin/cities/${city.id}`;

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-3xl">
          {city.name}, {city.state}
        </h1>
        <a href={`/city/${city.slug}`} target="_blank" className="text-sm text-gold underline">
          Open guide (admin preview) ↗
        </a>
      </div>
      <Flash sp={sp} />

      <Card title="City settings">
        <form action={updateCity}>
          <input type="hidden" name="id" value={city.id} />
          <CityFields city={city} />
        </form>
      </Card>

      {guide.map((s) => (
        <Card
          key={s.id}
          title={`${sectionType(s.type).icon} ${s.title}`}
          actions={
            <Link href={`/admin/listings/new?section=${s.id}`} className="rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-ink">
              + Add listing
            </Link>
          }
        >
          <details className="mb-4 text-sm">
            <summary className="text-muted">Edit section ({s.type})</summary>
            <form action={updateSection} className="mt-3 grid gap-3 md:grid-cols-4">
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="city_id" value={city.id} />
              <Field label="Title" name="title" defaultValue={s.title} />
              <Field label="Intro" name="intro" defaultValue={s.intro} className="md:col-span-2" />
              <Field label="Sort" name="sort" type="number" defaultValue={s.sort} />
              <div className="flex gap-2 md:col-span-4">
                <Btn>Save section</Btn>
                <Btn name="intent" value="delete" tone="danger">
                  Delete section
                </Btn>
              </div>
            </form>
          </details>
          {s.listings.length === 0 && <p className="text-sm text-muted">No listings yet.</p>}
          <ul className="divide-y divide-line">
            {s.listings.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <Link href={`/admin/listings/${l.id}`} className="text-white hover:text-gold">
                  {l.name}
                  {!l.active && <span className="ml-2 text-xs text-muted">(hidden)</span>}
                </Link>
                <span className="flex items-center gap-3 text-xs">
                  {!l.verified ? (
                    <span className="rounded bg-closing/15 px-1.5 py-0.5 font-semibold text-closing">UNVERIFIED</span>
                  ) : isStale(l) ? (
                    <span className="rounded bg-closing/15 px-1.5 py-0.5 text-closing">Stale · {fmtDate(l.last_verified_at)}</span>
                  ) : (
                    <span className="text-open">✓ {fmtDate(l.last_verified_at)}</span>
                  )}
                  <form action={markVerified}>
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="back" value={back} />
                    <button className="text-muted underline hover:text-gold">mark verified today</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <Card title="Add a section">
        <form action={createSection} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="city_id" value={city.id} />
          <label className="text-sm">
            <span className="block text-xs uppercase text-muted">Type</span>
            <select name="type" className="mt-1 rounded-lg border border-line bg-ink px-3 py-2">
              {SECTION_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.icon} {t.defaultTitle}
                </option>
              ))}
            </select>
          </label>
          <Field label="Title (optional)" name="title" placeholder="e.g. Breakfast" />
          <Btn>Add section</Btn>
        </form>
      </Card>
    </>
  );
}
