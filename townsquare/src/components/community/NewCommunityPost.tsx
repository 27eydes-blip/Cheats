"use client";

import { PlusIcon } from "../icons";
import { useComposer } from "../providers";

export function NewCommunityPost({ communityId, name }: { communityId: string; name: string }) {
  const openComposer = useComposer();
  return (
    <button type="button" className="btn-primary !min-h-9 !px-3.5 !text-[13.5px]" onClick={() => openComposer({ communityId, communityName: name })}>
      <PlusIcon size={16} strokeWidth={2.5} /> New discussion
    </button>
  );
}
