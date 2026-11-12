import { isStale, parseDetails, type Listing } from "@/lib/db";
import { localTime, openStatus, pickHoursSpec, weeklyTable, type LocalTime } from "@/lib/hours";
import { sectionType } from "@/lib/sections";
import { reserveLabel } from "@/lib/reserve";

const BADGE: Record<string, string> = {
  open: "bg-open/15 text-open ring-open/30",
  closing: "bg-closing/15 text-closing ring-closing/30",
  closed: "bg-closed/15 text-closed ring-closed/30",
  unknown: "bg-white/5 text-muted ring-white/10",
};

export function mapsUrl(address: string, name: string, apple: boolean): string {
  const q = encodeURIComponent(`${name}, ${address}`);
  return apple ? `https://maps.apple.com/?q=${q}` : `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function fmtDate(ms: number, tz: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz }).format(ms);
}

export function ListingCard(props: {
  listing: Listing;
  sectionKind: string;
  now: LocalTime;
  summer: boolean;
  seasonLabel: string;
  timezone: string;
  apple: boolean;
  citySlug: string;
  reported?: boolean;
}) {
  const { listing: l, now, summer, timezone, apple } = props;
  const def = sectionType(props.sectionKind);
  const details = parseDetails(l);
  const spec = def.uses.hours ? pickHoursSpec(l, summer) : null;
  const status = def.uses.hours ? openStatus(spec, now) : null;
  const week = weeklyTable(spec);
  const stale = isStale(l);

  const hasMore = (status && status.state !== "unknown") || def.fields.some((f) => details[f.key]) || !!l.address;
  const verified = l.verified && l.last_verified_at ? (
    <>
      Verified {fmtDate(l.last_verified_at, timezone)}
      {stale && <span className="text-closing"> · may be outdated</span>}
    </>
  ) : (
    <span className="font-semibold text-closing">UNVERIFIED</span>
  );

  return (
    <article id={`l${l.id}`} className="scroll-mt-32 rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-lg leading-tight text-white">{l.name}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {[l.category, def.uses.price && props.sectionKind !== "parking" ? l.price_range : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        {status && (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${BADGE[status.state]}`}>
            {status.state === "open" ? "Open now" : status.state === "closing" ? "Closes soon" : status.state === "closed" ? "Closed" : "Hours?"}
          </span>
        )}
      </div>

      {/* At a glance: status line, price for parking, the tip. Everything else folds into "More info". */}
      {status && status.state !== "unknown" && <p className="mt-2 text-sm text-zinc-300">{status.label}</p>}
      {props.sectionKind === "parking" && l.price_range && <p className="mt-2 text-sm text-zinc-200">💲 {l.price_range}</p>}
      {l.body && <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-zinc-200">{l.body}</p>}
      {l.local_tip && (
        <p className="mt-3 rounded-xl border-l-2 border-gold bg-gold/5 px-3 py-2 text-sm text-gold-soft">
          <span className="font-semibold">Local tip:</span> {l.local_tip}
        </p>
      )}

      {l.reserve_url && (
        <a
          href={`/r/${l.id}`}
          target="_blank"
          rel="noopener"
          className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-gold py-3 text-[15px] font-semibold text-ink shadow-[0_6px_20px_rgba(212,175,55,0.2)] active:bg-gold-deep"
        >
          🗓️ {reserveLabel(l.reserve_url)}
        </a>
      )}
      {(l.phone || l.address || l.website) && (
        <div className={`${l.reserve_url ? "mt-2" : "mt-3"} grid grid-cols-2 gap-2 text-sm font-medium`}>
          {l.phone && (
            <a href={`tel:${l.phone.replace(/[^\d+]/g, "")}`} className="rounded-xl bg-panel-2 py-2.5 text-center text-white ring-1 ring-line active:bg-line">
              {props.sectionKind === "food" && !l.reserve_url ? "📞 Call to reserve" : "📞 Call"}
            </a>
          )}
          {l.address && (
            <a
              href={mapsUrl(l.address, l.name, apple)}
              target="_blank"
              rel="noopener"
              className={`rounded-xl py-2.5 text-center ${l.reserve_url ? "bg-panel-2 text-white ring-1 ring-line active:bg-line" : "bg-gold text-ink active:bg-gold-deep"}`}
            >
              ➜ Directions
            </a>
          )}
          {l.website && !l.phone && (
            <a href={l.website} target="_blank" rel="noopener" className="rounded-xl bg-panel-2 py-2.5 text-center text-white ring-1 ring-line">
              Website
            </a>
          )}
        </div>
      )}

      <details className="group mt-3 border-t border-line pt-3" open={props.reported || undefined}>
        <summary className="flex items-center justify-between gap-3 text-[12px] text-muted">
          <span>{verified}</span>
          <span className="shrink-0 rounded-full border border-line px-3 py-1 text-zinc-300 group-open:border-gold group-open:text-gold-soft">
            {hasMore ? "More info" : "Report"} <span className="inline-block transition-transform group-open:rotate-180">▾</span>
          </span>
        </summary>
        <div className="mt-3">
          {status && status.state !== "unknown" && (
            <>
              <p className="font-mono text-[10px] tracking-[0.18em] text-muted">{props.seasonLabel.toUpperCase()} HOURS</p>
              <table className="mt-1 w-full text-[13px]">
                <tbody>
                  {week.map((d) => (
                    <tr key={d.day} className={d.index === now.weekday ? "text-gold-soft" : "text-zinc-400"}>
                      <td className="w-12 py-0.5">{d.day}</td>
                      <td className="py-0.5">{d.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {def.fields.map((f) => (details[f.key] ? <Row key={f.key} label={f.label} value={details[f.key]} /> : null))}
          {l.address && <p className="mt-3 text-sm text-zinc-400">📍 {l.address}</p>}
          {props.reported ? (
            <p className="mt-3 text-sm text-open">Thanks, we’ll check it ✓</p>
          ) : (
            <form method="post" action="/api/report" className="mt-4 flex flex-col gap-2">
              <label htmlFor={`rep-${l.id}`} className="text-xs text-muted">
                Something wrong? Tell us and we’ll fix it.
              </label>
              <textarea
                id={`rep-${l.id}`}
                name="message"
                required
                maxLength={1000}
                rows={2}
                placeholder="e.g. closes at 9 now"
                className="w-full rounded-lg border border-line bg-ink p-2 text-sm text-white"
              />
              <input type="hidden" name="listing_id" value={l.id} />
              <input type="hidden" name="city" value={props.citySlug} />
              <button className="self-end rounded-lg bg-panel-2 px-3 py-1.5 text-xs text-white ring-1 ring-line">Report wrong info</button>
            </form>
          )}
        </div>
      </details>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="mt-2 text-sm">
      <span className="text-muted">{label}: </span>
      <span className="whitespace-pre-line text-zinc-200">{value}</span>
    </p>
  );
}

