import { site } from "@/lib/site";
import { GleydeMark } from "./GleydeMark";
import { SEMonogram } from "./SEMonogram";

/**
 * Footer: mark, copyright, and the easter egg. Sam Eyde III's SE III
 * monogram sits in the corner at a whisper of opacity until it is hovered
 * or focused, then it lights up and names its owner.
 */
export function Footer() {
  return (
    <footer className="snap-end px-6 sm:px-10 lg:px-16">
      {/* snap-end (above) gives the page a final snap point so the footer is reachable. */}
      <div className="rule-t mx-auto flex max-w-[88rem] flex-col gap-10 py-14 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <GleydeMark title="" compact className="h-8 w-auto" />
          <span className="pl-[0.3em] font-display text-xs tracking-[0.3em] text-ivory/80">GLEYDE TECHNOLOGIES</span>
        </div>
        <div className="flex items-end justify-between gap-8 sm:items-center">
          <p className="max-w-md text-xs leading-relaxed text-ivory/50 sm:text-right">
            © {site.foundingYear} {site.legalName}. All rights reserved. {site.legalName} is owned by{" "}
            {site.founder}.
          </p>
          {/* Easter egg */}
          <a
            href="#top"
            className="group/egg relative block shrink-0 p-2"
            aria-label="SE III, the monogram of Sam Eyde III. Back to top"
            title="SE III"
          >
            <SEMonogram className="h-5 w-auto opacity-[0.1] transition-[opacity,filter] duration-700 ease-deco group-hover/egg:opacity-100 group-hover/egg:drop-shadow-[0_0_10px_rgba(230,201,122,0.6)] group-focus-visible/egg:opacity-100" />
            <span className="pointer-events-none absolute right-0 bottom-full mb-1 font-display text-[0.6rem] tracking-[0.3em] whitespace-nowrap text-gold-light opacity-0 transition-opacity duration-700 group-hover/egg:opacity-100 group-focus-visible/egg:opacity-100">
              SAM EYDE III
            </span>
          </a>
        </div>
      </div>
    </footer>
  );
}
