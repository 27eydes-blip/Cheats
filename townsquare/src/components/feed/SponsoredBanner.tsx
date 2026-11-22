"use client";

import { useEffect, useRef, useState } from "react";
import type { SponsoredCard as SponsoredCardData } from "@/lib/ads";
import { bannerCopy, DEFAULT_ACCENT, focalPosition, motionAllowed } from "@/lib/banner";
import { CloseIcon, MoreIcon } from "../icons";
import { useConfirm } from "../ui/Confirm";
import { Menu } from "../ui/Menu";

const HIDDEN_KEY = "wn-hidden-ads";
const readHidden = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]");
  } catch {
    return [];
  }
};

const track = (id: string, kind: "view" | "click", preview?: boolean) => {
  if (preview) return;
  const url = `/api/sponsors/${encodeURIComponent(id)}/event?kind=${kind}`;
  try {
    if (navigator.sendBeacon) navigator.sendBeacon(url);
    else void fetch(url, { method: "POST", keepalive: true }).catch(() => {});
  } catch {
    /* counting must never break the card */
  }
};

/** Reduced motion, data saver and slow connections, read once on the client. */
function useMotionOk() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    setOk(motionAllowed({ reducedMotion: !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, saveData: c?.saveData, effectiveType: c?.effectiveType }));
  }, []);
  return ok;
}

/**
 * A sponsored banner: one compact card (about 140px tall on phones, 160px on
 * wider columns, a 16:5 crop) with the image filling it, a dark gradient from
 * the left so the words always read, a bold short headline and one line, and
 * a single pill button in the sponsor's own color. "Sponsored" and the
 * sponsor's name sit in the top corner on every ad. The whole card is a link
 * (new tab, rel="sponsored noopener"). A soft sheen sweeps across once when it
 * first scrolls into view; optional short motion plays muted, only while
 * visible, never with reduced motion or data saver. Space is reserved before
 * the image loads, so nothing shifts.
 */
export function SponsoredCard({ ad, preview, previewImage }: { ad: SponsoredCardData; /** Control Room preview: no counting, no hiding */ preview?: boolean; /** Editor: an unsaved image with its focal point */ previewImage?: { src: string; x: number; y: number } | null }) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const motionOk = useMotionOk();
  const confirm = useConfirm();
  const b = ad.banner ?? { ...bannerCopy({ headline: ad.title, body: ad.body }), accent: DEFAULT_ACCENT, image: null, focal: { x: 0.5, y: 0.5 }, motion: null };

  useEffect(() => {
    if (!preview && readHidden().includes(ad.id)) setHidden(true);
  }, [ad.id, preview]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(([e]) => {
      setVisible(e.isIntersecting);
      if (e.isIntersecting) {
        setSeen(true);
        if (!preview && !t) t = setTimeout(() => track(ad.id, "view"), 1000);
      } else if (t) (clearTimeout(t), (t = null));
    }, { threshold: 0.5 });
    io.observe(el);
    return () => {
      io.disconnect();
      if (t) clearTimeout(t);
    };
  }, [ad.id, preview]);

  if (hidden) return null;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...new Set([...readHidden(), ad.id])].slice(-100)));
    } catch {
      /* private mode: hidden for this visit only */
    }
  };
  const why = () =>
    void confirm({
      title: "Why am I seeing this ad?",
      body: `Sponsored banners pay for WorldNet News. Everyone sees the same ones at fixed spots in For You (never in the first two items, at most one in every eight). They are not based on your interests or history, and we don't share your data with ${ad.sponsor}. Hide this ad from its ••• menu.`,
      confirm: "Got it",
    });
  const link = { href: ad.url, target: "_blank", rel: "sponsored noopener", onClick: () => track(ad.id, "click", preview) };
  const bg = previewImage ? { src: previewImage.src, pos: focalPosition(previewImage.x, previewImage.y) } : b.image && imgOk ? { src: b.image.w800, srcSet: `${b.image.w800} 800w, ${b.image.w1600} 1600w`, pos: "50% 50%" } : null;
  const play = !!b.motion && visible && motionOk && !previewImage;

  return (
    <aside ref={ref} aria-label={`Sponsored by ${ad.sponsor}`} className="@container px-4 py-2.5">
      <div
        className={`ad-banner relative isolate h-[140px] overflow-hidden rounded-[14px] ring-1 ring-white/10 @[560px]:h-[160px] ${seen ? "ad-seen" : ""}`}
        style={{ ["--ad-accent" as string]: b.accent, background: `linear-gradient(120deg, #070b14 30%, color-mix(in srgb, ${b.accent} 45%, #070b14))` }}
        data-motion={play || undefined}
      >
        {bg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg.src} srcSet={"srcSet" in bg ? bg.srcSet : undefined} sizes="(max-width: 640px) 100vw, 640px" alt={b.image?.alt ?? ""} loading="lazy" decoding="async" onError={() => setImgOk(false)} className="absolute inset-0 -z-10 h-full w-full object-cover" style={{ objectPosition: bg.pos }} />
        )}
        {play && b.motion?.type === "video/mp4" && <video src={b.motion.url} muted playsInline loop autoPlay preload="none" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover" />}
        {play && b.motion?.type === "image/webp" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.motion.url} alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover" />
        )}
        {/* Readability: a dark wash from the left keeps white text above 4.5:1 over any image. */}
        <span aria-hidden="true" className="absolute inset-0 -z-[5] bg-[linear-gradient(90deg,rgb(6_10_20/0.94)_0%,rgb(6_10_20/0.86)_45%,rgb(6_10_20/0.35)_75%,rgb(6_10_20/0.1)_100%)]" />
        <span aria-hidden="true" className="ad-sheen" />

        {/* The whole card is one link; the button and menu sit above it. */}
        <a {...link} className="absolute inset-0 z-[1] rounded-[14px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wn-blue-ink)]" aria-label={`${b.headline}${b.text ? `. ${b.text}` : ""}. ${ad.button || "Learn more"}. Sponsored by ${ad.sponsor}, opens in a new tab.`} />

        <p data-ad-label className="pointer-events-none absolute top-2.5 left-3 z-[2] flex max-w-[70%] items-center gap-1.5 text-[11.5px] leading-none text-white/85">
          <span className="rounded-[4px] bg-black/55 px-1.5 py-[3px] font-bold tracking-[0.04em] text-white ring-1 ring-white/25">Sponsored</span>
          <span className="truncate font-semibold">{ad.sponsor}</span>
        </p>
        {!preview && (
          <div className="absolute top-1 right-1 z-[3]">
            <Menu
              label={`Options for this ad from ${ad.sponsor}`}
              items={[
                { label: "Hide this ad", icon: <CloseIcon size={18} />, onSelect: hide },
                { label: "Why am I seeing this?", icon: <span aria-hidden="true" className="inline-block w-[18px] text-center font-bold">?</span>, onSelect: why },
              ]}
              button={<MoreIcon size={17} />}
              buttonClassName="flex h-11 w-11 items-center justify-center rounded-full text-white/85 hover:bg-black/40 hover:text-white"
            />
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[2] flex items-end justify-between gap-3">
          <div className="min-w-0 max-w-[64%]">
            <p className="line-clamp-2 text-[17px] leading-[1.15] font-extrabold text-white @[560px]:text-[20px]">{b.headline}</p>
            {b.text && <p className="mt-1 truncate text-[13px] text-white/85">{b.text}</p>}
          </div>
          <a {...link} tabIndex={-1} aria-hidden="true" className="ad-cta pointer-events-auto inline-flex h-11 shrink-0 items-center rounded-full px-4 text-[14px] font-bold text-white">
            {ad.button || "Learn more"}
          </a>
        </div>
      </div>
    </aside>
  );
}
