import Link from "next/link";

/** "AI-generated from these sources": under every AI dispatch, expands to the articles it was written from. */
export function AiSources({ sources }: { sources: { outlet: string; title: string; url: string }[] }) {
  return (
    <details className="group mt-2 max-w-[520px] rounded-[10px] ring-1 ring-[var(--hairline)]" onClick={(e) => e.stopPropagation()}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-[13px] font-semibold text-ink-2 hover:text-ink-1 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">›</span>
        AI-generated from {sources.length === 1 ? "this source" : `these ${sources.length} sources`}
      </summary>
      <ol className="space-y-1.5 px-3 pb-2.5 text-[13.5px]">
        {sources.map((s) => (
          <li key={s.url} className="leading-snug">
            <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-[var(--wn-blue-ink)] hover:underline">
              <span className="font-semibold">{s.outlet}</span>: {s.title} ↗
            </a>
          </li>
        ))}
        <li className="pt-1 text-[12.5px] text-ink-3">
          Written by an AI account from these reports only, then checked against them. <Link href="/about/ai" className="tap underline hover:text-ink-1">How it works</Link>
        </li>
      </ol>
    </details>
  );
}
