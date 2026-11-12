import Link from "next/link";
import { generateStickers, updateSticker } from "../../actions";
import { Btn, Card, Field, Flash } from "@/components/admin";
import type { City } from "@/lib/db";
import { baseUrl, getEnv } from "@/lib/env";
import { stickerUrl } from "@/lib/qr";

export const dynamic = "force-dynamic";

type Sticker = { id: string; label: string | null; batch: string | null; slug: string; city: string; scans: number; sales: number };

export default async function Stickers({ searchParams }: { searchParams: Promise<{ city?: string; batch?: string; error?: string }> }) {
  const sp = await searchParams;
  const env = await getEnv();
  const db = env.DB;
  const cities = (await db.prepare("SELECT * FROM cities ORDER BY name").all<City>()).results;
  const cityId = sp.city ? Number(sp.city) : cities[0]?.id;
  const [batches, stickers] = await db.batch([
    db.prepare("SELECT batch, COUNT(*) AS n FROM stickers WHERE city_id = ? GROUP BY batch ORDER BY MAX(created_at) DESC").bind(cityId ?? 0),
    db.prepare(
      `SELECT st.*, c.slug, c.name AS city,
        (SELECT COUNT(*) FROM scans s WHERE s.sticker_id = st.id) AS scans,
        (SELECT COUNT(*) FROM purchases p WHERE p.sticker_id = st.id AND p.status = 'paid') AS sales
       FROM stickers st JOIN cities c ON c.id = st.city_id
       WHERE st.city_id = ? AND (? = '' OR st.batch = ?) ORDER BY st.created_at DESC, st.id LIMIT 300`,
    ).bind(cityId ?? 0, sp.batch ?? "", sp.batch ?? ""),
  ]);
  const base = baseUrl(env);
  const back = `/admin/stickers?city=${cityId}${sp.batch ? `&batch=${encodeURIComponent(sp.batch)}` : ""}`;

  return (
    <>
      <Flash sp={sp} />
      {base.includes("workers.dev") || base.includes("localhost") ? (
        <p className="rounded-xl border border-closing/40 bg-closing/10 p-3 text-sm text-closing">
          QR codes currently point to <b>{base}</b>. Set PUBLIC_BASE_URL to your real domain before printing. Sticker IDs stay the same;
          just re-download.
        </p>
      ) : null}

      <Card title="Generate stickers">
        <form action={generateStickers} className="grid items-end gap-4 md:grid-cols-5">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">City</span>
            <select name="city_id" defaultValue={cityId} className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm">
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Field label="How many" name="count" type="number" defaultValue={10} />
          <Field label="Batch name" name="batch" placeholder="2026-summer-docks" />
          <Field label="Location label (optional)" name="label" placeholder="Gosman's Dock" />
          <Btn>Generate</Btn>
        </form>
        <p className="mt-3 text-xs text-muted">Each sticker gets a unique ID so you can see which placement sells. Label each one after you put it up.</p>
      </Card>

      <Card
        title="Stickers"
        actions={
          <Link
            href={`/admin/stickers/print?city=${cityId}${sp.batch ? `&batch=${encodeURIComponent(sp.batch)}` : ""}`}
            className="rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-ink"
            target="_blank"
          >
            Printable sheet ↗
          </Link>
        }
      >
        <form className="mb-4 flex flex-wrap gap-2 text-sm">
          <select name="city" defaultValue={cityId} className="rounded-lg border border-line bg-ink px-3 py-2">
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="batch" defaultValue={sp.batch ?? ""} className="rounded-lg border border-line bg-ink px-3 py-2">
            <option value="">All batches</option>
            {(batches.results as { batch: string; n: number }[]).map((b) => (
              <option key={b.batch} value={b.batch}>
                {b.batch} ({b.n})
              </option>
            ))}
          </select>
          <button className="rounded-lg bg-panel-2 px-4 py-2 ring-1 ring-line">Filter</button>
        </form>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(stickers.results as Sticker[]).map((s) => (
            <div key={s.id} className="flex gap-3 rounded-xl border border-line bg-panel-2 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/admin/qr/${s.id}?format=svg`} alt={s.id} width={88} height={88} className="rounded bg-white" loading="lazy" />
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-mono text-xs text-gold-soft">{s.id}</div>
                <div className="text-xs text-muted">
                  {s.scans} scans · {s.sales} sales
                </div>
                <form action={updateSticker} className="mt-1 flex gap-1">
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="back" value={back} />
                  <input name="label" defaultValue={s.label ?? ""} placeholder="Where is it?" className="w-full min-w-0 rounded border border-line bg-ink px-2 py-1 text-xs" />
                  <button className="rounded bg-panel px-2 text-xs ring-1 ring-line">✓</button>
                </form>
                <div className="mt-1.5 flex gap-3 text-xs">
                  <a className="text-gold underline" href={`/api/admin/qr/${s.id}?format=png&download=1`}>
                    PNG
                  </a>
                  <a className="text-gold underline" href={`/api/admin/qr/${s.id}?format=svg&download=1`}>
                    SVG
                  </a>
                  <a className="truncate text-muted underline" href={stickerUrl(base, s.slug, s.id)} target="_blank">
                    test link
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
