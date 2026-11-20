"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "../icons";
import { usePhone } from "./useMedia";

/**
 * Responsive overlay built on <dialog> (focus trap + Escape for free).
 * Phones: a bottom sheet that follows your finger and dismisses on a drag
 * past 120px or a fast flick. Larger screens: a centered dialog.
 */
export function Sheet({
  open, onClose, title, children, wide, hideTitle, fullHeight,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean; hideTitle?: boolean; fullHeight?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const phone = usePhone();
  const [dy, setDy] = useState(0);
  const drag = useRef<{ y: number; t: number } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setDy(0);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const start = (e: React.PointerEvent) => {
    if (!phone) return;
    drag.current = { y: e.clientY, t: Date.now() };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => drag.current && setDy(Math.max(0, e.clientY - drag.current.y));
  const end = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const v = (e.clientY - drag.current.y) / Math.max(1, Date.now() - drag.current.t);
    drag.current = null;
    if (dy > 120 || v > 0.6) onClose();
    else setDy(0);
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={
        phone
          ? `fixed inset-x-0 top-auto bottom-0 m-0 w-full max-w-none rounded-t-[var(--r-xl)] bg-surface p-0 text-ink-1 shadow-3 ${fullHeight ? "h-[94dvh]" : "max-h-[90dvh]"}`
          : `m-auto max-h-[86vh] w-[calc(100%-2rem)] rounded-[var(--r-xl)] bg-surface p-0 text-ink-1 shadow-3 ${wide ? "max-w-2xl" : "max-w-xl"}`
      }
      style={phone ? { transform: dy ? `translateY(${dy}px)` : undefined, transition: drag.current ? "none" : "transform 380ms var(--ease-spring)", animation: "sheet-up 380ms var(--ease-out)", paddingBottom: "env(safe-area-inset-bottom)" } : undefined}
    >
      {open && (
        <div className={`flex flex-col ${phone ? (fullHeight ? "h-[94dvh]" : "max-h-[90dvh]") : "max-h-[86vh]"}`} style={{ ["--avatar-gap" as string]: "var(--surface)" }}>
          <div onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} className={`shrink-0 ${phone ? "cursor-grab touch-none" : ""}`}>
            {phone && <div aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-strong" />}
            <div className={`flex items-center gap-2 px-3 ${phone ? "pt-1 pb-1" : "py-2"} ${hideTitle ? "sr-only" : ""}`}>
              <h2 className="flex-1 px-1 text-[17px] font-bold">{title}</h2>
              <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2" aria-label="Close">
                <CloseIcon size={20} />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        </div>
      )}
    </dialog>
  );
}
