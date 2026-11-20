"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { followAction } from "@/actions/social";
import { CheckIcon } from "./icons";
import { useToast, useViewer } from "./providers";

/** Optimistic follow toggle. Hover on "Following" previews "Unfollow". */
export function FollowButton({ userId, following: initial, small }: { userId: string; following: boolean; small?: boolean }) {
  const viewer = useViewer();
  const router = useRouter();
  const toast = useToast();
  const [following, setFollowing] = useState(initial);
  const [pending, start] = useTransition();
  if (viewer?.id === userId) return null;
  const size = small ? "!min-h-8 !px-3.5 !text-[13px]" : "";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!viewer) return router.push("/login");
        const next = !following;
        setFollowing(next);
        start(async () => {
          const r = await followAction(userId, next);
          if (!r.ok) {
            setFollowing(!next);
            toast(r.error, "error");
          }
        });
      }}
      aria-pressed={following}
      className={`group ${following ? "btn-outline hover:!text-danger hover:!shadow-[inset_0_0_0_1px_var(--danger)]" : "btn-ink"} ${size}`}
    >
      {following ? (
        <>
          <span className="flex items-center gap-1 group-hover:hidden"><CheckIcon size={14} strokeWidth={2.6} /> Following</span>
          <span className="hidden group-hover:inline">Unfollow</span>
        </>
      ) : (
        "Follow"
      )}
    </button>
  );
}
