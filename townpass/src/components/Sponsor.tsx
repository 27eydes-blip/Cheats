import { dailyPick, SPONSOR, sponsorHref } from "@/lib/sponsor";

/** Sponsor card for the guide home: artwork tile + short copy, clearly labelled. */
export function SponsorCard({ citySlug }: { citySlug: string }) {
  return (
    <section aria-label={`Sponsored by ${SPONSOR.name}`} className="mt-7">
      <p className="smallcaps mb-2 text-[11px] text-muted">Sponsored by {SPONSOR.name}</p>
      <a
        href={sponsorHref("guide-home", citySlug)}
        target="_blank"
        rel="sponsored noopener"
        className="glass flex items-center gap-0 overflow-hidden rounded-2xl bg-[#0a1412] active:border-sea"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dailyPick(SPONSOR.tiles)} alt={`${SPONSOR.name}: tap, glide, don't stop`} width={150} height={124} loading="lazy" decoding="async" className="h-auto w-[150px] shrink-0 self-center" />
        <span className="flex min-w-0 flex-col justify-center gap-1 px-4 py-3">
          <span className="font-serif text-lg leading-tight text-ivory">{SPONSOR.name}</span>
          <span className="text-[13px] leading-snug text-zinc-400">{SPONSOR.blurb}</span>
          <span className="mt-1 self-start rounded-full border border-sea/50 px-2.5 py-0.5 text-[12px] font-semibold text-sea-soft">Play free ›</span>
        </span>
      </a>
    </section>
  );
}

/** One quiet line for every page footer. */
export function SponsorLine({ placement = "footer" }: { placement?: string }) {
  return (
    <p className="mt-4 text-[12px] text-muted">
      Sponsored by{" "}
      <a href={sponsorHref(placement)} target="_blank" rel="sponsored noopener" className="font-semibold tracking-wide text-sea-soft">
        {SPONSOR.name.toUpperCase()}
      </a>
      <span className="text-zinc-600"> · free one-tap arcade game</span>
    </p>
  );
}
