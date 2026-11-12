import Link from "next/link";
import { logout } from "../actions";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false, follow: false } };

const NAV = [
  ["/admin", "Dashboard"],
  ["/admin/cities", "Cities & listings"],
  ["/admin/verify", "Verify"],
  ["/admin/reports", "Reports"],
  ["/admin/stickers", "QR stickers"],
  ["/admin/purchases", "Purchases"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const env = await requireAdmin();
  const [stale, reports] = await env.DB.batch([
    env.DB.prepare(
      "SELECT COUNT(*) AS n FROM listings WHERE active = 1 AND (verified = 0 OR last_verified_at IS NULL OR last_verified_at < ?)",
    ).bind(Date.now() - 30 * 86_400_000),
    env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"),
  ]);
  const badges: Record<string, number> = {
    "/admin/verify": (stale.results[0] as { n: number }).n,
    "/admin/reports": (reports.results[0] as { n: number }).n,
  };
  return (
    <div className="min-h-dvh">
      <header className="no-print border-b border-line bg-panel">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">{env.BRAND_NAME} admin</span>
          <nav className="flex flex-wrap gap-4 text-sm">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="text-zinc-300 hover:text-gold">
                {label}
                {badges[href] ? <span className="ml-1 rounded-full bg-closing/20 px-1.5 text-xs text-closing">{badges[href]}</span> : null}
              </Link>
            ))}
          </nav>
          <form action={logout} className="ml-auto">
            <button className="text-sm text-muted hover:text-white">Log out</button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-6 px-5 py-6">{children}</div>
    </div>
  );
}
