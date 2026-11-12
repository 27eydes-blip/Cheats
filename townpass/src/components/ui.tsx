import Link from "next/link";
import { Icon } from "./Icon";
import { SponsorLine } from "./Sponsor";

/** Wordmark: compass-and-wave mark + name, with the last word ("Go") in gold. */
export function Brand({ name = "CoastPassGo" }: { name?: string }) {
  const m = /^(.*?)(Go)$/.exec(name);
  return (
    <Link href="/" className="inline-flex items-center gap-2.5" aria-label={`${name} home`}>
      {/* old money: gold crest; new money: metallic turquoise "Go" */}
      <span className="crest size-8">
        <Icon name="logo" className="size-5" strokeWidth={1.6} />
      </span>
      <span className="font-serif text-[19px] tracking-[0.02em] text-ivory">
        {m ? (
          <>
            {m[1]}
            <span className="sea-text font-sans text-[17px] font-bold tracking-tight">{m[2]}</span>
          </>
        ) : (
          name
        )}
      </span>
    </Link>
  );
}

export function Footer({ brand = "CoastPassGo", support }: { brand?: string; support?: string }) {
  return (
    <footer className="mx-auto max-w-xl px-5 pb-10 pt-8 text-center text-xs text-muted">
      <div className="flex justify-center gap-4">
        <Link href="/terms" className="hover:text-gold">Terms</Link>
        <Link href="/privacy" className="hover:text-gold">Privacy</Link>
        {support && (
          <a href={`mailto:${support}`} className="hover:text-gold">
            Contact
          </a>
        )}
      </div>
      <SponsorLine />
      <p className="mt-3">© {new Date().getFullYear()} {brand}</p>
    </footer>
  );
}

export function Notice({ tone = "gold", children }: { tone?: "gold" | "red" | "green"; children: React.ReactNode }) {
  const cls =
    tone === "red"
      ? "border-closed/40 bg-closed/10 text-red-200"
      : tone === "green"
        ? "border-open/40 bg-open/10 text-green-200"
        : "border-gold/40 bg-gold/10 text-gold-soft";
  return <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}
