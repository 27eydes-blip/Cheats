import { Card, fmtDateTime } from "@/components/admin";
import { formatMoney, type Purchase } from "@/lib/db";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const COLOR: Record<string, string> = { paid: "text-open", refunded: "text-closed", disputed: "text-closed", pending: "text-muted", expired: "text-zinc-600" };

export default async function Purchases({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const env = await getEnv();
  const test = env.STRIPE_SECRET_KEY?.startsWith("sk_test") ? "test/" : "";
  const term = (q || "").trim().toLowerCase();
  const { results } = await env.DB.prepare(
    `SELECT p.*, c.name AS city FROM purchases p JOIN cities c ON c.id = p.city_id
     WHERE (? = '' OR p.email LIKE ? OR p.sticker_id = UPPER(?) OR p.stripe_payment_intent = ?)
     AND p.status != 'expired'
     ORDER BY p.created_at DESC LIMIT 200`,
  )
    .bind(term, `%${term}%`, term, term)
    .all<Purchase & { city: string }>();

  return (
    <Card title="Purchases">
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search email, sticker ID or pi_…" className="w-80 max-w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm" />
        <button className="rounded-lg bg-panel-2 px-4 py-2 text-sm ring-1 ring-line">Search</button>
      </form>
      <p className="mb-3 text-xs text-muted">
        All sales are final per Terms. To make an exception (e.g. duplicate charge), refund in the Stripe Dashboard: access is revoked
        automatically by the webhook.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr>
              <th className="pb-2">Created</th>
              <th>City</th>
              <th>Email</th>
              <th>Sticker</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Stripe</th>
            </tr>
          </thead>
          <tbody>
            {results.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="py-2">{fmtDateTime(p.created_at)}</td>
                <td>{p.city}</td>
                <td className="text-zinc-300">{p.email ?? "-"}</td>
                <td className="font-mono text-xs">{p.sticker_id ?? "-"}</td>
                <td>{formatMoney(p.amount_cents, p.currency)}</td>
                <td className={COLOR[p.status]}>{p.status}</td>
                <td>
                  {p.stripe_payment_intent ? (
                    <a className="text-gold underline" target="_blank" href={`https://dashboard.stripe.com/${test}payments/${p.stripe_payment_intent}`}>
                      open ↗
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
