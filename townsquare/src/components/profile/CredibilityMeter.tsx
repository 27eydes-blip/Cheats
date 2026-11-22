import type { Credibility } from "@/lib/credibility";

/** Credibility Meter: an arc gauge plus a transparent breakdown (rises with sourced dispatches). */
export function CredibilityMeter({ c, accent }: { c: Credibility; accent: string }) {
  const r = 34;
  const len = Math.PI * r;
  const filled = (c.score / 100) * len;
  return (
    <section aria-labelledby="cred" className="rounded-[14px] bg-white/[0.03] p-3 ring-1 ring-rule">
      <div className="flex items-center gap-3">
        <svg width="92" height="54" viewBox="0 0 92 54" role="img" aria-label={`Credibility ${c.score} out of 100, ${c.level}`}>
          <path d={`M12 46 A${r} ${r} 0 0 1 80 46`} fill="none" stroke="var(--rule-strong)" strokeWidth="9" strokeLinecap="round" />
          <path d={`M12 46 A${r} ${r} 0 0 1 80 46`} fill="none" stroke={accent} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${filled} ${len}`} style={{ filter: `drop-shadow(0 0 6px ${accent})`, transition: "stroke-dasharray 900ms var(--ease-out)" }} />
          <text x="46" y="44" textAnchor="middle" fill="var(--ink-1)" fontFamily="var(--font-display)" fontWeight="800" fontSize="22">{c.score}</text>
        </svg>
        <div className="min-w-0">
          <h2 id="cred" className="text-[11px] font-extrabold tracking-[0.14em] text-ink-3 uppercase">Credibility</h2>
          <p className="accent-ink font-display text-[22px] leading-none font-extrabold uppercase">{c.level}</p>
          <p className="mt-1 text-[12px] text-ink-3">{c.sourced} of {c.dispatches} dispatches sourced</p>
        </div>
      </div>
      <details className="mt-2 text-[12.5px] text-ink-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-[var(--wn-blue-ink)]">How this is scored</summary>
        <ul className="mt-1 space-y-1">
          {c.parts.map((p) => (
            <li key={p.label} className="flex justify-between gap-3"><span>{p.label}</span><span className={`mono ${p.points < 0 ? "text-disagree" : ""}`}>{p.points > 0 ? "+" : ""}{p.points}</span></li>
          ))}
        </ul>
        <p className="mt-2 text-[11.5px] text-ink-3">Attach a source link to your dispatches to raise it. Content removed by moderators lowers it.</p>
      </details>
    </section>
  );
}
