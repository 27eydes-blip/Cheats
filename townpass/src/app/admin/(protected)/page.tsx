import Link from "next/link";
import { Card } from "@/components/admin";
import { formatMoney, type City } from "@/lib/db";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const TZ = "America/New_York"; // dashboard day boundaries

type Agg = { n: number; cents: number };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ city?: string; days?: string }> }) {
  const sp = await searchParams;
  const env = await getEnv();
  const db = env.DB;
  const cityId = sp.city ? Number(sp.city) : null;
  const days = Math.min(365, Math.max(7, Number(sp.days) || 30));
  const since = Date.now() - days * 86_400_000;
  const cityFilter = cityId ? "AND p.city_id = ?" : "";
  const cb = cityId ? [cityId] : [];

  const [cities, totals, refunds, perCity, perSticker, daily, direct] = await db.batch([
    db.prepare("SELECT * FROM cities ORDER BY name"),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS cents FROM purchases p WHERE status='paid' ${cityFilter}`).bind(...cb),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS cents FROM purchases p WHERE status IN ('refunded','disputed') ${cityFilter}`).bind(...cb),
    db.prepare(
      `SELECT c.id, c.name, c.state,
        (SELECT COUNT(*) FROM purchases p WHERE p.city_id=c.id AND p.status='paid') AS sales,
        (SELECT COALESCE(SUM(amount_cents),0) FROM purchases p WHERE p.city_id=c.id AND p.status='paid') AS cents,
        (SELECT COUNT(*) FROM purchases p WHERE p.city_id=c.id AND p.status='paid' AND p.paid_at > ?) AS recent,
        (SELECT COUNT(*) FROM scans s WHERE s.city_id=c.id) AS scans
       FROM cities c ORDER BY cents DESC, c.name`,
    ).bind(since),
    db.prepare(
      `SELECT st.id, st.label, st.batch, c.name AS city,
        (SELECT COUNT(*) FROM scans s WHERE s.sticker_id = st.id) AS scans,
        (SELECT COUNT(*) FROM purchases p WHERE p.sticker_id = st.id AND p.status='paid') AS sales,
        (SELECT COALESCE(SUM(amount_cents),0) FROM purchases p WHERE p.sticker_id = st.id AND p.status='paid') AS cents
       FROM stickers st JOIN cities c ON c.id = st.city_id ${cityId ? "WHERE st.city_id = ?" : ""}
       ORDER BY cents DESC, scans DESC LIMIT 200`,
    ).bind(...cb),
    db.prepare(`SELECT paid_at, amount_cents FROM purchases p WHERE status='paid' AND paid_at > ? ${cityFilter}`).bind(since, ...cb),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS cents FROM purchases p WHERE status='paid' AND sticker_id IS NULL ${cityFilter}`).bind(...cb),
  ]);

  const t = totals.results[0] as Agg;
  const r = refunds.results[0] as Agg;
  const d = direct.results[0] as Agg;

  // Bucket sales per local day.
  const dayKey = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(ms);
  const buckets = new Map<string, Agg>();
  for (let i = days - 1; i >= 0; i--) buckets.set(dayKey(Date.now() - i * 86_400_000), { n: 0, cents: 0 });
  for (const row of daily.results as { paid_at: number; amount_cents: number }[]) {
    const b = buckets.get(dayKey(row.paid_at));
    if (b) {
      b.n++;
      b.cents += row.amount_cents;
    }
  }
  const series = [...buckets.entries()];
  const max = Math.max(1, ...series.map(([, v]) => v.cents));
  const periodCents = series.reduce((s, [, v]) => s + v.cents, 0);
  const today = series.at(-1)?.[1] ?? { n: 0, cents: 0 };

  return (
    <>
      <form className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs uppercase text-muted">City</span>
          <select name="city" defaultValue={sp.city ?? ""} className="mt-1 rounded-lg border border-line bg-panel px-3 py-2">
            <option value="">All cities</option>
            {(cities.results as unknown as City[]).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs uppercase text-muted">Days</span>
          <select name="days" defaultValue={String(days)} className="mt-1 rounded-lg border border-line bg-panel px-3 py-2">
            {[7, 30, 90, 365].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <button className="rounded-lg bg-panel-2 px-4 py-2 text-sm ring-1 ring-line">Apply</button>
      </form>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Revenue (all time)" value={formatMoney(t.cents)} sub={plural(t.n, "sale")} />
        <Stat label={`Last ${days} days`} value={formatMoney(periodCents)} sub={plural(series.reduce((s, [, v]) => s + v.n, 0), "sale")} />
        <Stat label="Today" value={formatMoney(today.cents)} sub={plural(today.n, "sale")} />
        <Stat label="Refunded / disputed" value={formatMoney(r.cents)} sub={plural(r.n, "purchase")} />
      </div>
      <p className="text-xs text-muted">Gross amounts before Stripe fees (≈ 2.9% + 30¢ per charge in the US; check your Stripe pricing).</p>

      <Card title={`Sales per day · last ${days} days`}>
        <div className="flex h-40 items-end gap-[2px]">
          {series.map(([day, v]) => (
            <div key={day} title={`${day}: ${v.n} sales, ${formatMoney(v.cents)}`} className="group relative flex-1">
              <div className="w-full rounded-t bg-gold/80 group-hover:bg-gold" style={{ height: `${Math.max(v.cents ? 4 : 1, (v.cents / max) * 152)}px` }} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted">
          <span>{series[0]?.[0]}</span>
          <span>{series.at(-1)?.[0]}</span>
        </div>
        <details className="mt-3 text-sm">
          <summary className="text-muted">Table</summary>
          <table className="mt-2 w-full text-left text-sm">
            <tbody>
              {[...series].reverse().filter(([, v]) => v.n > 0).map(([day, v]) => (
                <tr key={day} className="border-t border-line">
                  <td className="py-1">{day}</td>
                  <td>{v.n}</td>
                  <td>{formatMoney(v.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      <Card title="Per city">
        <Table head={["City", "Scans", "Sales", `Sales (${days}d)`, "Revenue"]}>
          {(perCity.results as { id: number; name: string; state: string; scans: number; sales: number; recent: number; cents: number }[]).map((c) => (
            <tr key={c.id} className="border-t border-line">
              <td className="py-2">
                <Link href={`/admin?city=${c.id}&days=${days}`} className="text-gold hover:underline">
                  {c.name}, {c.state}
                </Link>
              </td>
              <td>{c.scans}</td>
              <td>{c.sales}</td>
              <td>{c.recent}</td>
              <td>{formatMoney(c.cents)}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="Per sticker">
        <Table head={["Sticker", "Location", "City", "Scans", "Sales", "Conv.", "Revenue"]}>
          {(perSticker.results as { id: string; label: string | null; city: string; scans: number; sales: number; cents: number }[]).map((s) => (
            <tr key={s.id} className="border-t border-line">
              <td className="py-2 font-mono text-xs">{s.id}</td>
              <td className="text-zinc-400">{s.label ?? "-"}</td>
              <td>{s.city}</td>
              <td>{s.scans}</td>
              <td>{s.sales}</td>
              <td>{s.scans ? `${Math.round((s.sales / s.scans) * 100)}%` : "-"}</td>
              <td>{formatMoney(s.cents)}</td>
            </tr>
          ))}
          <tr className="border-t border-line text-zinc-400">
            <td className="py-2" colSpan={4}>No sticker (direct / shared link)</td>
            <td>{d.n}</td>
            <td />
            <td>{formatMoney(d.cents)}</td>
          </tr>
        </Table>
      </Card>
    </>
  );
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 font-serif text-2xl text-gold-soft">{value}</div>
      <div className="text-xs text-zinc-500">{sub}</div>
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="text-xs uppercase text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="pb-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
