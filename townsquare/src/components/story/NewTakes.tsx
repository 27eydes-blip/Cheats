"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useLiveEvents } from "../live";

/** "3 new takes" pill on a Story page, fed by the live stream. Tap to load them. */
export function NewTakes({ storyKey }: { storyKey: string }) {
  const [ids, setIds] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const router = useRouter();
  useLiveEvents((e) => {
    if (e.type === "take" && e.storyKey === storyKey && !document.querySelector(`[data-post-id="${e.postId}"]`)) setIds((x) => (x.includes(e.postId) ? x : [...x, e.postId]));
  });
  if (!ids.length) return null;
  return (
    <div className="pointer-events-none sticky top-[calc(var(--dial-h)+52px)] z-20 flex justify-center">
      <button
        type="button"
        onClick={() => start(() => (router.refresh(), setIds([])))}
        className="pointer-events-auto mt-2 inline-flex items-center gap-2 rounded-[4px] bg-navy px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgb(11_31_75/0.35),inset_0_-2px_0_var(--gold)] animate-stamp"
        aria-live="polite"
      >
        <span className="h-2 w-2 animate-live rounded-full bg-live" aria-hidden="true" />
        {pending ? "Loading…" : `${ids.length} new take${ids.length > 1 ? "s" : ""} · Show`}
      </button>
    </div>
  );
}
