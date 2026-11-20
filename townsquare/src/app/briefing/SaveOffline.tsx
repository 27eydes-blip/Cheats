"use client";

import { useState } from "react";
import { DownloadIcon } from "@/components/icons";
import { useToast } from "@/components/providers";

/** Asks the service worker to keep a copy of this edition (and its stories) for offline reading. */
export function SaveOffline() {
  const toast = useToast();
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  return (
    <button
      type="button"
      disabled={state === "saving"}
      onClick={async () => {
        if (!("serviceWorker" in navigator) || !("caches" in window)) return toast("Offline saving needs the installed app or a modern browser.", "error");
        setState("saving");
        try {
          const urls = [location.pathname, ...[...document.querySelectorAll<HTMLAnchorElement>('main a[href^="/news/story/"]')].map((a) => a.getAttribute("href")!)];
          const cache = await caches.open("ts-editions");
          await cache.addAll([...new Set(urls)]);
          setState("saved");
          toast(`Saved ${new Set(urls).size} pages for offline reading`);
        } catch {
          setState("idle");
          toast("Couldn't save for offline. Try again.", "error");
        }
      }}
      className="inline-flex items-center gap-1.5 font-semibold text-navy-ink hover:underline"
    >
      <DownloadIcon size={14} /> {state === "saved" ? "Saved offline" : state === "saving" ? "Saving…" : "Download for offline"}
    </button>
  );
}
