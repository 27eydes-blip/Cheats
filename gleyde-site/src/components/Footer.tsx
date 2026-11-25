import { site } from "@/lib/site";
import { GleydeMark } from "./GleydeMark";
import { SEMonogram } from "./SEMonogram";

/**
 * Footer with the copyright line. The SE III monogram in the corner is the
 * site's easter egg: nearly invisible until hovered or focused, then it
 * glows gold and names its owner.
 */
export function Footer() {
  return (
    <footer className="relative px-6 pt-20 pb-10 sm:px-8">
      <div className="hairline mx-auto max-w-6xl opacity-40" aria-hidden="true" />
      <div className="mx-auto mt-14 flex max-w-6xl flex-col items-center gap-8 text-center">
        <GleydeMark title="" compact className="h-10 w-auto opacity-80" />
        <p className="font-display text-sm tracking-[0.34em] pl-[0.34em] text-ivory/80">GLEYDE TECHNOLOGIES</p>
        <p className="max-w-xl text-xs leading-relaxed tracking-[0.04em] text-ivory/60">
          © {site.foundingYear} {site.legalName}. All rights reserved. {site.legalName} is owned by{" "}
          {site.founder}.
        </p>
      </div>

      {/* Easter egg */}
      <div className="mx-auto mt-10 flex max-w-6xl justify-end">
        <a
          href="#top"
          className="group/egg relative block p-2 outline-offset-2"
          aria-label="SE III, the monogram of Sam Eyde III. Back to top"
          title="SE III"
        >
          <SEMonogram className="h-5 w-auto opacity-[0.12] transition-[opacity,filter] duration-700 ease-deco group-hover/egg:opacity-100 group-hover/egg:drop-shadow-[0_0_10px_rgba(239,227,196,0.75)] group-focus-visible/egg:opacity-100" />
          <span className="pointer-events-none absolute right-0 bottom-full mb-1 font-display text-[0.6rem] tracking-[0.3em] whitespace-nowrap text-gold-light opacity-0 transition-opacity duration-700 group-hover/egg:opacity-100 group-focus-visible/egg:opacity-100">
            SAM EYDE III
          </span>
        </a>
      </div>
    </footer>
  );
}
