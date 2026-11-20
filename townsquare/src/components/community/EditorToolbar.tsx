"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { pinStoryAction } from "@/actions/communities";
import { useToast } from "../providers";
import { PinIcon, ShieldIcon } from "../icons";

/** Shown only to a Desk's Editors: pin a national Story, and a reminder of the editor tools. */
export function EditorToolbar({ communityId, pinned, stories }: { communityId: string; pinned: string | null; stories: { key: string; title: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(pinned ?? "");
  const [pending, start] = useTransition();
  return (
    <div role="toolbar" aria-label="Editor toolbar" className="flex flex-wrap items-center gap-3 border-y border-gold bg-gold-soft px-4 py-2.5 sm:px-6">
      <span className="folio flex items-center gap-1.5 !text-[10.5px] text-gold-ink"><ShieldIcon size={14} /> Editor</span>
      <label className="flex min-w-0 flex-1 items-center gap-2 text-[13px]">
        <PinIcon size={15} className="text-ink-3" />
        <span className="sr-only">Pinned story</span>
        <select value={value} onChange={(e) => setValue(e.target.value)} className="input !w-auto min-w-0 flex-1 !py-1.5 !text-[13px]">
          <option value="">No pinned story</option>
          {stories.map((s) => <option key={s.key} value={s.key}>{s.title}</option>)}
        </select>
      </label>
      <button
        type="button"
        disabled={pending || value === (pinned ?? "")}
        onClick={() => start(async () => {
          const r = await pinStoryAction(communityId, value || null);
          toast(r.ok ? "Pinned story updated" : r.error, r.ok ? "ok" : "error");
          router.refresh();
        })}
        className="btn-primary !min-h-9 !px-3 !text-[12.5px]"
      >
        Pin
      </button>
      <span className="text-[12px] text-ink-3">Remove discussions with the trash icon. Site-wide rules always apply.</span>
    </div>
  );
}
