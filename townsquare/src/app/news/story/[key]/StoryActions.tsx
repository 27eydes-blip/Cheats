"use client";

import { useComposer, useToast } from "@/components/providers";
import { ShareIcon } from "@/components/icons";

export function StoryActions({ tag, title }: { tag: string | null; title: string }) {
  const openComposer = useComposer();
  const toast = useToast();
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {tag && (
        <button type="button" onClick={() => openComposer({ prefill: `#${tag}` })} className="btn !min-h-10 bg-white !px-4 !text-[14px] text-[#0f1420] hover:bg-white/90">
          Join the conversation
        </button>
      )}
      <button
        type="button"
        onClick={async () => {
          const url = location.href;
          if (navigator.share) {
            try {
              await navigator.share({ url, title });
              return;
            } catch {
              /* cancelled */
            }
          }
          await navigator.clipboard?.writeText(url);
          toast("Link copied");
        }}
        className="btn !min-h-10 bg-white/12 !px-4 !text-[14px] text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/20"
      >
        <ShareIcon size={16} /> Share
      </button>
    </div>
  );
}
