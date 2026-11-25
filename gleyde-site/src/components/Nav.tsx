"use client";

import { AnimatePresence, m } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { navLinks } from "@/lib/site";
import { GleydeMark } from "./GleydeMark";
import { easeDeco } from "./Reveal";

/**
 * Fixed, minimal navigation. Transparent over the hero; once the page
 * scrolls it gains a blurred ink backdrop and a hairline underneath.
 * On phones the links collapse into a full-screen overlay menu.
 */
export function Nav() {
  const pathname = usePathname();
  const onHome = pathname === "/";
  /** Section anchors point at the home page when we're on another page. */
  const resolve = (href: string) => (href.startsWith("#") && !onHome ? `/${href}` : href);
  const isCurrent = (href: string) => href === pathname;
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // While the mobile menu is open: lock page scroll and close on Escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={`absolute inset-0 transition-[background-color,backdrop-filter,opacity] duration-700 ease-deco ${
          scrolled || open ? "bg-ink/70 opacity-100 backdrop-blur-xl" : "opacity-0"
        }`}
        aria-hidden="true"
      />
      <div
        className={`hairline absolute inset-x-0 bottom-0 transition-opacity duration-700 ${
          scrolled && !open ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      />

      <nav
        aria-label="Primary"
        className="relative mx-auto flex h-16 max-w-[calc(88rem+8rem)] items-center justify-between px-6 sm:h-18 sm:px-10 lg:px-16"
      >
        <a
          href={onHome ? "#top" : "/"}
          className="group flex items-center gap-3"
          aria-label="Gleyde Technologies, back to top"
          onClick={() => setOpen(false)}
        >
          <GleydeMark
            title=""
            compact
            className="h-7 w-auto transition-[filter] duration-500 group-hover:drop-shadow-[0_0_8px_rgba(239,227,196,0.55)]"
          />
          <span className="font-display text-[0.95rem] tracking-[0.28em] text-ivory">GLEYDE</span>
        </a>

        <ul className="hidden items-center gap-9 md:flex">
          {navLinks.map((l) => (
            <li key={l.href}>
              <NavLink
                href={resolve(l.href)}
                current={isCurrent(l.href)}
                className="group relative py-2 text-[0.72rem] font-medium tracking-[0.26em] text-ivory/70 uppercase transition-colors duration-300 hover:text-ivory aria-[current=page]:text-ivory"
              >
                {l.label}
                <span className="absolute inset-x-0 -bottom-0.5 h-(--hair) origin-left scale-x-0 bg-gold transition-transform duration-500 ease-deco group-hover:scale-x-100 group-aria-[current=page]:scale-x-100" />
              </NavLink>
            </li>
          ))}
        </ul>

        <button
          ref={toggleRef}
          type="button"
          className="relative -mr-2 flex size-11 items-center justify-center md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="relative block h-3 w-6" aria-hidden="true">
            <span
              className={`absolute left-0 block h-px w-6 bg-ivory transition-transform duration-500 ease-deco ${
                open ? "top-1.5 rotate-45" : "top-0"
              }`}
            />
            <span
              className={`absolute left-0 block h-px bg-gold transition-all duration-500 ease-deco ${
                open ? "top-1.5 w-6 -rotate-45" : "top-3 w-4"
              }`}
            />
          </span>
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <m.div
            id="mobile-menu"
            className="fixed inset-x-0 top-16 bottom-0 bg-ink/95 backdrop-blur-xl md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: easeDeco }}
          >
            <ul className="flex h-full flex-col justify-center gap-2 px-8 pb-24">
              {navLinks.map((l, i) => (
                <m.li
                  key={l.href}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, ease: easeDeco, delay: 0.06 * i + 0.08 }}
                >
                  <NavLink
                    href={resolve(l.href)}
                    current={isCurrent(l.href)}
                    onClick={() => setOpen(false)}
                    className="flex items-baseline gap-5 py-3 font-display text-3xl tracking-[0.08em] text-ivory aria-[current=page]:text-gold-light"
                  >
                    <span className="w-6 font-sans text-[0.65rem] tracking-[0.2em] text-gold">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {l.label}
                  </NavLink>
                </m.li>
              ))}
            </ul>
          </m.div>
        )}
      </AnimatePresence>
    </header>
  );
}

/**
 * In-page anchors ("#…") stay plain links so the home page's smooth paging
 * (PageScroller) can glide to them; page links ("/…") use Next.js Link for
 * instant client-side navigation.
 */
function NavLink({
  href,
  current,
  ...rest
}: { href: string; current: boolean } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const aria = current ? ({ "aria-current": "page" } as const) : {};
  return href.startsWith("#") ? <a href={href} {...aria} {...rest} /> : <Link href={href} {...aria} {...rest} />;
}
