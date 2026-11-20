"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Position a small popover with `position: fixed` next to its trigger, so
 * cards and sheets with overflow-hidden can't clip it. Opens above the
 * trigger when there's room, otherwise below; always stays on screen.
 */
export function useFloating(anchor: React.RefObject<HTMLElement | null>, open: boolean, size: { w: number; h: number }) {
  const [style, setStyle] = useState<React.CSSProperties>({ position: "fixed", visibility: "hidden" });
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const r = anchor.current!.getBoundingClientRect();
      const left = Math.min(innerWidth - size.w - 8, Math.max(8, r.left + r.width / 2 - size.w / 2));
      const above = r.top - size.h - 8 > 70;
      const top = above ? r.top - size.h - 8 : Math.min(innerHeight - size.h - 8, r.bottom + 8);
      setStyle({ position: "fixed", left, top, width: size.w, zIndex: 80 });
    };
    place();
    addEventListener("scroll", place, true);
    addEventListener("resize", place);
    return () => (removeEventListener("scroll", place, true), removeEventListener("resize", place));
  }, [open, anchor, size.w, size.h]);
  return style;
}


/** Render a floating layer outside clipping/blur ancestors (inside an open dialog when there is one). */
export function FloatingPortal({ anchor, children }: { anchor: React.RefObject<HTMLElement | null>; children: React.ReactNode }) {
  if (typeof document === "undefined" || !anchor.current) return null;
  const host = (anchor.current.closest("dialog[open]") as HTMLElement | null) ?? document.body;
  return createPortal(children, host);
}
