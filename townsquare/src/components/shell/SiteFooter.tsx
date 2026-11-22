import Link from "next/link";
import { COMPANY, PERSONAL_LOGO } from "@/config";
import { LogoMark, Wordmark } from "../ui/Logo";

/** Site footer: brand, links, and (if configured) the owner's small maker's mark. */
export function SiteFooter() {
  return (
    <footer className="relative mt-16 border-t border-rule bg-[var(--wn-panel-0)]/60">
      <div aria-hidden="true" className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-[var(--wn-blue)] to-transparent" />
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-6 px-4 py-8 text-[13px] text-ink-3 lg:px-8">
        <div className="flex items-center gap-3">
          <LogoMark size={36} />
          <div>
            <Wordmark size="sm" className="text-ink-1 [--wn-cyan-wordmark:var(--wn-cyan)]" />
            <p className="mt-1">Built by {COMPANY}. Sample stories and outlets are fictional.</p>
          </div>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-1">
          {[["/legal/terms", "Terms"], ["/legal/privacy", "Privacy"], ["/legal/guidelines", "Community Guidelines"], ["/design", "Design system"]].map(([href, label]) => (
            <Link key={href} href={href} className="inline-flex min-h-11 min-w-11 items-center justify-center hover:text-[var(--wn-cyan-ink)]">{label}</Link>
          ))}
        </nav>
        {PERSONAL_LOGO && (
          <a href={PERSONAL_LOGO.href ?? "/"} className="ml-auto opacity-40 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0" title={PERSONAL_LOGO.alt}>
            <img src={PERSONAL_LOGO.src} alt={PERSONAL_LOGO.alt} width={22} height={22} className="h-[22px] w-auto" />
          </a>
        )}
      </div>
    </footer>
  );
}
