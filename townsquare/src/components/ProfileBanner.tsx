"use client";

import { useEffect, useRef } from "react";
import { palette } from "./ui/Avatar";

/** Profile banner with a gentle parallax as you scroll (disabled for reduced motion). */
export function ProfileBanner({ url, handle }: { url: string | null; handle: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = Math.min(240, window.scrollY);
        if (ref.current) ref.current.style.transform = `translateY(${y * 0.35}px) scale(${1 + y / 1600})`;
      });
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const { h1, h2 } = palette(handle);
  return (
    <div className="relative aspect-[3/1] max-h-[230px] w-full overflow-hidden bg-surface-2">
      <div ref={ref} className="absolute inset-0 will-change-transform">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full" style={{ background: `radial-gradient(120% 140% at 15% 10%, hsl(${h1} 85% 62%), transparent 60%), radial-gradient(120% 140% at 90% 90%, hsl(${h2} 80% 45%), transparent 55%), linear-gradient(135deg, hsl(${h1} 60% 35%), hsl(${h2} 65% 22%))` }}>
            <div className="h-full w-full bg-[radial-gradient(rgb(255_255_255/0.18)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:linear-gradient(90deg,transparent,#000)]" />
          </div>
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/25" />
    </div>
  );
}
