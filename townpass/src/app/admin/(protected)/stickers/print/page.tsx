import { getEnv, baseUrl } from "@/lib/env";
import { qrSvg, stickerUrl } from "@/lib/qr";
import { formatMoney, type City } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Print-ready sheet: 2" stickers, 3 per row on US Letter. Use the browser's Print → Save as PDF. */
export default async function PrintSheet({ searchParams }: { searchParams: Promise<{ city?: string; batch?: string }> }) {
  const sp = await searchParams;
  const env = await getEnv();
  const city = await env.DB.prepare("SELECT * FROM cities WHERE id = ?").bind(Number(sp.city)).first<City>();
  if (!city) return <p>Pick a city.</p>;
  const { results } = await env.DB.prepare("SELECT id FROM stickers WHERE city_id = ? AND (? = '' OR batch = ?) ORDER BY created_at, id LIMIT 300")
    .bind(city.id, sp.batch ?? "", sp.batch ?? "")
    .all<{ id: string }>();
  const base = baseUrl(env);

  return (
    <div className="bg-white text-black">
      <style>{`@page { size: letter; margin: 0.4in; } body { background: #fff; }`}</style>
      <p className="no-print p-4 text-sm text-zinc-700">
        {results.length} stickers · Print with “Background graphics” on, scale 100%. Codes point to {base}.
      </p>
      <div className="grid grid-cols-3 gap-[0.2in] p-[0.2in]">
        {results.map((s) => (
          <div key={s.id} className="flex break-inside-avoid flex-col items-center rounded-2xl border-2 border-[#d4af37] bg-[#0b0b0d] p-3 text-center text-white" style={{ width: "2.3in" }}>
            <div className="text-[9px] font-semibold uppercase tracking-[0.25em] text-[#d4af37]">{env.BRAND_NAME}</div>
            <div className="mt-0.5 font-serif text-lg leading-tight">{city.name} Local Guide</div>
            <div className="mt-2 rounded-lg bg-white p-1" style={{ width: "1.6in", height: "1.6in" }} dangerouslySetInnerHTML={{ __html: qrSvg(stickerUrl(base, city.slug, s.id)) }} />
            <div className="mt-2 text-[11px] text-zinc-200">Scan · {formatMoney(city.price_cents, city.currency)} · Instant access</div>
            <div className="font-mono text-[8px] text-zinc-500">{s.id}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
