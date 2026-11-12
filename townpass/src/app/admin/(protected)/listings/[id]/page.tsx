import Link from "next/link";
import { notFound } from "next/navigation";
import { saveListing } from "../../../actions";
import { Btn, Card, Field, Flash, fmtDate } from "@/components/admin";
import { isStale, parseDetails, type Listing, type Section } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { sectionType } from "@/lib/sections";

export const dynamic = "force-dynamic";

const HOURS_HINT = 'e.g. "mon-fri 08:00-21:00; sat 09:00-22:00; sun closed" · "daily 11:30-15:00, 17:00-22:00" · "thu-sat 22:00-04:00" · "daily 24h"';

export default async function ListingAdmin({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string; error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const env = await getEnv();
  const db = env.DB;
  const isNew = id === "new";
  const listing = isNew ? null : await db.prepare("SELECT * FROM listings WHERE id = ?").bind(Number(id)).first<Listing>();
  if (!isNew && !listing) notFound();
  const sectionId = listing?.section_id ?? Number(sp.section);
  const section = await db.prepare("SELECT * FROM sections WHERE id = ?").bind(sectionId).first<Section>();
  if (!section) notFound();
  const { results: siblings } = await db.prepare("SELECT * FROM sections WHERE city_id = ? AND type = ? ORDER BY sort").bind(section.city_id, section.type).all<Section>();
  const def = sectionType(section.type);
  const details = listing ? parseDetails(listing) : {};
  const [openReports] = listing
    ? [(await db.prepare("SELECT * FROM reports WHERE listing_id = ? AND status = 'open' ORDER BY created_at DESC").bind(listing.id).all<{ id: number; message: string; created_at: number }>()).results]
    : [[]];

  return (
    <>
      <Link href={`/admin/cities/${section.city_id}`} className="text-sm text-muted hover:text-gold">
        ← Back to city
      </Link>
      <h1 className="font-serif text-3xl">{listing ? listing.name : `New ${def.defaultTitle.toLowerCase()} listing`}</h1>
      <Flash sp={sp} />
      {listing && (
        <p className="text-sm">
          {!listing.verified ? (
            <span className="font-semibold text-closing">UNVERIFIED placeholder, confirm every field, then “Save & mark verified”.</span>
          ) : (
            <span className={isStale(listing) ? "text-closing" : "text-open"}>
              Last verified {fmtDate(listing.last_verified_at)}
              {isStale(listing) && ": older than 30 days, please re-check"}
            </span>
          )}
        </p>
      )}
      {openReports.length > 0 && (
        <Card title="Open user reports">
          <ul className="space-y-2 text-sm">
            {openReports.map((r) => (
              <li key={r.id} className="rounded-lg bg-closing/10 p-2 text-zinc-200">
                “{r.message}” <span className="text-xs text-muted">{fmtDate(r.created_at)}</span>
              </li>
            ))}
          </ul>
          <Link href="/admin/reports" className="mt-2 inline-block text-xs text-gold underline">
            Resolve in Reports
          </Link>
        </Card>
      )}

      <form action={saveListing} className="space-y-6">
        {listing && <input type="hidden" name="id" value={listing.id} />}
        <Card title="Basics">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={section.type === "tips" ? "Tip headline" : "Name"} name="name" required defaultValue={listing?.name} />
            <Field label="Category" name="category" defaultValue={listing?.category} placeholder={section.type === "essentials" ? "Pharmacy" : section.type === "parking" ? "Municipal lot" : ""} />
            {siblings.length > 1 ? (
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">Section</span>
                <select name="section_id" defaultValue={section.id} className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm">
                  {siblings.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="section_id" value={section.id} />
            )}
            {def.uses.address && <Field label="Address" name="address" defaultValue={listing?.address} placeholder="123 Main St, Montauk, NY 11954" />}
            {def.uses.phone && <Field label="Phone" name="phone" type="tel" defaultValue={listing?.phone} placeholder="(631) 555-0100" />}
            <Field label="Website" name="website" type="url" defaultValue={listing?.website} />
            {def.uses.price && <Field label={def.priceLabel ?? "Price"} name="price_range" defaultValue={listing?.price_range} placeholder={section.type === "parking" ? "$5/hr, max $40/day" : "$$"} />}
            <Field label="Sort order" name="sort" type="number" defaultValue={listing?.sort ?? 0} hint="Lower shows first" />
            <label className="flex items-center gap-2 self-center text-sm">
              <input type="checkbox" name="active" defaultChecked={listing ? !!listing.active : true} className="size-4 accent-[#d4af37]" />
              Visible in guide
            </label>
          </div>
        </Card>

        {def.uses.hours && (
          <Card title="Hours">
            <p className="mb-4 text-xs text-muted">
              24-hour clock, local time. {HOURS_HINT}. Summer / off-season override the default during that season (season dates are set per
              city). Leave blank if not applicable.
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Default hours" name="hours_default" multiline mono defaultValue={listing?.hours_default} />
              <Field label="Summer hours" name="hours_summer" multiline mono defaultValue={listing?.hours_summer} />
              <Field label="Off-season hours" name="hours_offseason" multiline mono defaultValue={listing?.hours_offseason} />
            </div>
          </Card>
        )}

        <Card title="Details">
          <div className="grid gap-4 md:grid-cols-2">
            {def.fields.map((f) => (
              <Field key={f.key} label={f.label} name={`detail_${f.key}`} multiline={f.multiline} defaultValue={details[f.key]} placeholder={f.placeholder} />
            ))}
            {def.uses.tip && <Field label="Local tip (one line, gold callout)" name="local_tip" defaultValue={listing?.local_tip} className="md:col-span-2" />}
            {def.uses.body && <Field label="Tip text" name="body" multiline rows={6} defaultValue={listing?.body} className="md:col-span-2" />}
          </div>
        </Card>

        <div className="flex flex-wrap gap-3">
          {/* "Save only" first so pressing Enter never marks a listing verified by accident */}
          <Btn name="intent" value="save" tone="plain">
            Save only
          </Btn>
          <Btn name="intent" value="verify">
            Save & mark verified today
          </Btn>
          {listing?.verified ? (
            <Btn name="intent" value="unverify" tone="plain">
              Save as UNVERIFIED
            </Btn>
          ) : null}
          {listing && (
            <Btn name="intent" value="delete" tone="danger">
              Delete
            </Btn>
          )}
        </div>
      </form>
    </>
  );
}
