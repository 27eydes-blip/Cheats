import Link from "next/link";
import { INDEX_OF, fundLabel, proxyNote } from "@/lib/markets/universe";

/** Business: the main indexes at a glance (labeled Demo when prices are simulated). */
export function MarketsCard({ quotes, demo, idp = "" }: { idp?: string; quotes: { symbol: string; name: string; price: number; changePct: number }[]; demo: boolean }) {
  if (!quotes.length) return null;
  return (
    <section aria-labelledby={`${idp}mkts`} className="rounded-[16px] bg-white/[0.03] p-4 ring-1 ring-[var(--hairline)]">
      <h2 id={`${idp}mkts`} className="flex items-center justify-between text-[12px] font-extrabold tracking-[0.12em] text-ink-3 uppercase">
        Markets {demo && <span className="rounded-[5px] px-1.5 py-0.5 text-[10.5px] ring-1 ring-[var(--hairline)]">Demo prices</span>}
      </h2>
      <ul className="mt-1.5">
        {quotes.map((q) => (
          <li key={q.symbol} className="flex min-h-10 items-center justify-between gap-2 text-[14px]">
            <span className="min-w-0">
              <span className="block font-semibold">{fundLabel(q.symbol) === q.symbol ? q.name : fundLabel(q.symbol)}</span>
              {INDEX_OF[q.symbol] && <span className="block text-[11.5px] text-ink-3">{proxyNote(q.symbol)}</span>}
            </span>
            <span className="num">
              {q.price.toFixed(2)} <span className={q.changePct >= 0 ? "text-[#4ade80]" : "text-[#f87171]"}>{q.changePct >= 0 ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(2)}%</span>
            </span>
          </li>
        ))}
      </ul>
      <Link href="/markets" className="tap mt-1 inline-flex min-h-10 items-center text-[13.5px] text-[var(--wn-blue-ink)] hover:underline">Open Markets</Link>
    </section>
  );
}
