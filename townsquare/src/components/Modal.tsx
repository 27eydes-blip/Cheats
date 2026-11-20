"use client";

import { useEffect, useRef } from "react";
import { CloseIcon } from "./icons";

/**
 * Accessible modal built on <dialog>: focus is trapped, Escape closes it,
 * and on phones it fills the screen like a sheet.
 */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={`m-0 h-[100dvh] max-h-none w-full max-w-none bg-bg p-0 text-fg sm:m-auto sm:mt-[8vh] sm:h-auto sm:max-h-[84vh] sm:rounded-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-xl"}`}
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/95 px-2 py-1.5 backdrop-blur">
            <button type="button" onClick={onClose} className="btn-ghost min-w-11 px-0" aria-label="Close">
              <CloseIcon />
            </button>
            <h2 className="text-lg font-bold">{title}</h2>
          </div>
          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      )}
    </dialog>
  );
}
