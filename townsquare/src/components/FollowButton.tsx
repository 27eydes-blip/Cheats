"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { followAction } from "@/actions/social";
import { useToast, useViewer } from "./providers";

export function FollowButton({ userId, following: initial, small }: { userId: string; following: boolean; small?: boolean }) {
  const viewer = useViewer();
  const router = useRouter();
  const toast = useToast();
  const [following, setFollowing] = useState(initial);
  const [hover, setHover] = useState(false);
  const [pending, start] = useTransition();
  if (viewer?.id === userId) return null;
  return (
    <button
      type="button"
      disabled={pending}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        e.stopPropagation();
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
      className={`${following ? (hover ? "btn-outline border-danger text-danger" : "btn-outline") : "btn bg-fg text-bg hover:opacity-90"} ${small ? "min-h-9 px-3.5 text-sm" : ""}`}
    >
      {following ? (hover ? "Unfollow" : "Following") : "Follow"}
    </button>
  );
}
