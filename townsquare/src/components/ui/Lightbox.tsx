"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BackIcon, ChevronRight, CloseIcon } from "../icons";

export type LightboxImage = { url: string; alt: string; width: number | null; height: number | null; blur?: string | null };

/**
 * Full-screen image viewer: swipe (or arrow keys) between images, pinch or
 * double-tap to zoom, drag to pan when zoomed, swipe down or Escape to close.
 */
export function Lightbox({ images, start, onClose }: { images: LightboxImage[]; start: number; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  const [zoom, setZoom] = useState({ s: 1, x: 0, y: 0 });
  const [dragY, setDragY] = useState(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; s: number; x: number; y: number; px: number; py: number; startY: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    ref.current?.showModal();
    requestAnimationFrame(() => track.current?.scrollTo({ left: start * (track.current?.clientWidth ?? 0) }));
  }, [start]);

  const goTo = useCallback((i: number) => {
    const n = Math.max(0, Math.min(images.length - 1, i));
    track.current?.scrollTo({ left: n * (track.current?.clientWidth ?? 0), behavior: "smooth" });
  }, [images.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goTo(index + 1);
      if (e.key === "ArrowLeft") goTo(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, goTo]);

  const onScroll = () => {
    const t = track.current;
    if (!t) return;
    const i = Math.round(t.scrollLeft / t.clientWidth);
    if (i !== index) {
      setIndex(i);
      setZoom({ s: 1, x: 0, y: 0 });
    }
  };

  const down = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      gesture.current = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), s: zoom.s, x: zoom.x, y: zoom.y, px: 0, py: 0, startY: 0 };
    } else if (pts.length === 1) {
      const now = Date.now();
      if (now - lastTap.current < 280) setZoom((z) => (z.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 }));
      lastTap.current = now;
      gesture.current = { dist: 0, s: zoom.s, x: zoom.x, y: zoom.y, px: e.clientX, py: e.clientY, startY: e.clientY };
    }
    if (zoom.s > 1 || pts.length === 2) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    if (!g) return;
    if (pts.length === 2 && g.dist) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      setZoom((z) => ({ ...z, s: Math.max(1, Math.min(5, (g.s * d) / g.dist)) }));
    } else if (pts.length === 1 && zoom.s > 1) {
      setZoom((z) => ({ ...z, x: g.x + (e.clientX - g.px), y: g.y + (e.clientY - g.py) }));
    } else if (pts.length === 1 && zoom.s === 1) {
      const dy = e.clientY - g.startY;
      if (Math.abs(dy) > 8) setDragY(Math.max(0, dy));
    }
  };
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      if (dragY > 120) onClose();
      setDragY(0);
      if (zoom.s < 1.05) setZoom({ s: 1, x: 0, y: 0 });
      gesture.current = null;
    }
  };

  const img = images[index];
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label="Image viewer"
      className="m-0 h-[100dvh] max-h-none w-screen max-w-none bg-transparent p-0 text-white backdrop:bg-black/90"
      style={{ background: `rgb(0 0 0 / ${Math.max(0.35, 0.94 - dragY / 500)})` }}
    >
      <div
        ref={track}
        onScroll={onScroll}
        className={`scrollbar-none flex h-full w-full snap-x snap-mandatory ${zoom.s > 1 ? "overflow-hidden" : "overflow-x-auto"}`}
      >
        {images.map((m, i) => (
          <div
            key={m.url}
            className="flex h-full w-full shrink-0 snap-center items-center justify-center overflow-hidden"
            onPointerDown={i === index ? down : undefined}
            onPointerMove={i === index ? move : undefined}
            onPointerUp={i === index ? up : undefined}
            onPointerCancel={i === index ? up : undefined}
            onClick={(e) => e.target === e.currentTarget && zoom.s === 1 && onClose()}
            style={{ touchAction: zoom.s > 1 ? "none" : "pan-x" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.url}
              alt={m.alt || `Image ${i + 1}`}
              draggable={false}
              className="max-h-full max-w-full object-contain select-none"
              style={{
                transform: i === index ? `translate(${zoom.x}px, ${zoom.y + dragY}px) scale(${zoom.s - dragY / 1200})` : undefined,
                transition: gesture.current ? "none" : "transform 280ms var(--ease-out)",
                backgroundImage: m.blur ? `url(${m.blur})` : undefined,
                backgroundSize: "cover",
              }}
            />
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        <button type="button" onClick={onClose} className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur" aria-label="Close image viewer">
          <CloseIcon size={22} />
        </button>
        {images.length > 1 && <span className="num rounded-full bg-black/50 px-3 py-1 text-[13px] font-semibold backdrop-blur">{index + 1} / {images.length}</span>}
      </div>
      {images.length > 1 && (
        <>
          <button type="button" onClick={() => goTo(index - 1)} disabled={index === 0} className="absolute top-1/2 left-3 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 backdrop-blur disabled:opacity-0 sm:inline-flex" aria-label="Previous image">
            <BackIcon />
          </button>
          <button type="button" onClick={() => goTo(index + 1)} disabled={index === images.length - 1} className="absolute top-1/2 right-3 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 backdrop-blur disabled:opacity-0 sm:inline-flex" aria-label="Next image">
            <ChevronRight />
          </button>
        </>
      )}
      {img?.alt && (
        <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-5 pt-10 text-[14px] leading-snug" style={{ paddingBottom: "max(18px, env(safe-area-inset-bottom))" }}>
          {img.alt}
        </p>
      )}
    </dialog>
  );
}
