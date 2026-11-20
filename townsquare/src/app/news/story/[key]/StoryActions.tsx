"use client";

import { useComposer, useToast } from "@/components/providers";
import { ShareIcon, TakeIcon } from "@/components/icons";

export function StoryActions({ storyKey, title }: { storyKey: string; title: string }) {
  const openComposer = useComposer();
  const toast = useToast();
  return (
    <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
      <button type="button" onClick={() => openComposer({ storyKey })} className="btn-primary"><TakeIcon size={16} /> Dispatch</button>
      <button
        type="button"
        aria-label="Share story"
        onClick={async () => {
          if (navigator.share) {
            try { await navigator.share({ url: location.href, title }); return; } catch { /* cancelled */ }
          }
          await navigator.clipboard?.writeText(location.href);
          toast("Link copied");
        }}
        className="btn-outline !px-3"
      >
        <ShareIcon size={17} />
      </button>
    </div>
  );
}
