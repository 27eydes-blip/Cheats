"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { joinCommunityAction } from "@/actions/communities";
import { CheckIcon, PlusIcon } from "../icons";
import { useToast, useViewer } from "../providers";

export function JoinButton({ communityId, joined: initial, name, size = "md", onChange }: { communityId: string; joined: boolean; name: string; size?: "sm" | "md"; onChange?: (j: boolean) => void }) {
  const viewer = useViewer();
  const router = useRouter();
  const toast = useToast();
  const [joined, setJoined] = useState(initial);
  const [pending, start] = useTransition();
  const cls = size === "sm" ? "!min-h-8 !px-3.5 !text-[13px]" : "";
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={joined}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!viewer) return router.push("/login");
        const next = !joined;
        setJoined(next);
        onChange?.(next);
        start(async () => {
          const r = await joinCommunityAction(communityId, next);
          if (!r.ok) {
            setJoined(!next);
            onChange?.(!next);
            toast(r.error, "error");
          } else {
            toast(next ? `Joined ${name}` : `Left ${name}`);
            router.refresh();
          }
        });
      }}
      className={`${joined ? "btn-outline" : "btn-primary"} ${cls}`}
    >
      {joined ? <><CheckIcon size={15} strokeWidth={2.6} /> Joined</> : <><PlusIcon size={15} strokeWidth={2.6} /> Join</>}
    </button>
  );
}
