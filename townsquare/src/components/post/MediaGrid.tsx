"use client";

import { useState } from "react";
import type { PostView } from "@/lib/posts";
import { Lightbox } from "../ui/Lightbox";

type Media = PostView["media"][number];

/** Responsive image with a blurred placeholder and reserved space (no layout shift). */
export function MediaImg({ m, className = "", sizes = "(max-width: 640px) 100vw, 600px", eager }: { m: Media; className?: string; sizes?: string; eager?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${m.url}?w=960`}
      srcSet={`${m.url}?w=320 320w, ${m.url}?w=640 640w, ${m.url}?w=960 960w, ${m.url}?w=1280 1280w`}
      sizes={sizes}
      alt={m.alt || "Image"}
      width={m.width ?? undefined}
      height={m.height ?? undefined}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onLoad={() => setLoaded(true)}
      className={`h-full w-full object-cover transition-[filter,opacity] duration-500 ${loaded ? "" : "blur-md"} ${className}`}
      style={m.blur ? { backgroundImage: `url(${m.blur})`, backgroundSize: "cover" } : undefined}
    />
  );
}

/** Smart grid: 1 tall, 2 side by side, 3 as hero + stack, 4 as a 2×2. Tap opens the lightbox. */
export function MediaGrid({ media }: { media: PostView["media"] }) {
  const [open, setOpen] = useState<number | null>(null);
  const n = media.length;
  const single = n === 1 ? media[0] : null;
  const ratio = single?.width && single.height ? Math.min(1.25, Math.max(0.56, single.height / single.width)) : 0.66;
  return (
    <>
      <div
        className={`mt-3 grid gap-[3px] overflow-hidden rounded-[var(--r-lg)] ring-1 ring-line ${n === 1 ? "grid-cols-1" : "grid-cols-2"} ${n > 2 ? "grid-rows-2" : ""}`}
        style={{ aspectRatio: n === 1 ? `1 / ${ratio}` : n === 2 ? "16 / 10" : "16 / 11" }}
        onClick={(e) => e.stopPropagation()}
      >
        {media.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={`Open image ${i + 1} of ${n}${m.alt ? ` (ALT): ${m.alt}` : ""}`}
            className={`group relative block overflow-hidden bg-surface-2 ${n === 3 && i === 0 ? "row-span-2" : ""}`}
          >
            <MediaImg m={m} className="transition-transform duration-500 group-hover:scale-[1.03]" sizes={n === 1 ? "(max-width: 640px) 100vw, 600px" : "(max-width: 640px) 50vw, 300px"} />
            {m.alt && <span aria-hidden="true" className="absolute bottom-2 left-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[10.5px] font-bold text-white backdrop-blur">ALT</span>}
          </button>
        ))}
      </div>
      {open !== null && <Lightbox images={media} start={open} onClose={() => setOpen(null)} />}
    </>
  );
}
