"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Rundown } from "@/lib/rundown";
import { CloseIcon } from "../icons";
import { usePhone } from "../ui/useMedia";
import { RundownList } from "./RundownList";

/** The Rundown drawer: slides in from the right on desktop, up from the bottom on phones. */
export function RundownDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const phone = usePhone();
  const [data, setData] = useState<Rundown | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setError(false);
      fetch("/api/rundown").then((r) => (r.ok ? r.json() : Promise.reject())).then(setData).catch(() => setError(true));
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label="Your Rundown"
      className={phone ? "fixed inset-x-0 top-auto bottom-0 m-0 h-[88dvh] max-h-none w-full max-w-none rounded-t-[8px] bg-paper p-0 text-ink-1" : "fixed top-0 right-0 bottom-0 left-auto m-0 h-[100dvh] max-h-none w-[460px] max-w-[92vw] bg-paper p-0 text-ink-1 shadow-3"}
      style={{ animation: `${phone ? "sheet-up" : "drawer-in"} 380ms var(--ease-out)` }}
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-rule px-5 py-3">
            <div>
              <p className="folio !text-[10px] text-gold-ink">Your lineup</p>
              <h2 className="font-display text-h2 font-semibold">The Rundown</h2>
            </div>
            <div className="flex items-center gap-1">
              <Link href="/rundown" onClick={onClose} className="btn-outline !min-h-9 !px-3 !text-[12.5px]">Full page</Link>
              <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] hover:bg-paper-2" aria-label="Close Rundown"><CloseIcon size={20} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4" style={{ ["--avatar-gap" as string]: "var(--paper)" }}>
            {error ? <p className="py-10 text-center text-ink-3">Couldn&apos;t load your Rundown.</p> : data ? <RundownList data={data} compact /> : <div className="space-y-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-16" />)}</div>}
          </div>
        </div>
      )}
    </dialog>
  );
}
