"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { followAction } from "@/actions/social";
import { CheckIcon, ClockIcon } from "./icons";
import { useToast, useViewer } from "./providers";

type State = "none" | "following" | "requested";

/**
 * Optimistic follow toggle. Hovering "Following" previews "Unfollow"; private
 * accounts get a "Requested" state until they approve.
 */
export function FollowButton({ userId, following: initial, requested = false, small, onChange }: { userId: string; following: boolean; requested?: boolean; small?: boolean; onChange?: (s: State) => void }) {
  const viewer = useViewer();
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<State>(initial ? "following" : requested ? "requested" : "none");
  const [pending, start] = useTransition();
  const [glow, setGlow] = useState(0);
  if (viewer?.id === userId) return null;
  const size = small ? "relative !min-h-9 !px-3.5 !text-[13px] before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']" : "";
  const on = state !== "none";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!viewer) return router.push("/login");
        const prev = state;
        setState(on ? "none" : "following");
        start(async () => {
          const r = await followAction(userId, !on);
          if (!r.ok) {
            setState(prev);
            toast(r.error, "error");
          } else {
            const next = r.data as State;
            setState(next);
            onChange?.(next);
            if (next === "requested") toast("Request sent. They'll see it in their notifications.");
            if (next === "following" && prev === "none") setGlow((g) => g + 1);
          }
        });
      }}
      aria-pressed={on}
      key={glow}
      style={glow ? { animation: "glow-pulse 900ms ease-out" } : undefined}
      className={`group ${on ? "btn-outline hover:!text-danger hover:!shadow-[inset_0_0_0_1px_var(--danger)]" : "btn-primary"} ${size}`}
    >
      {state === "following" ? (
        <>
          <span className="flex items-center gap-1 group-hover:hidden"><CheckIcon size={14} strokeWidth={2.6} /> Following</span>
          <span className="hidden group-hover:inline">Unfollow</span>
        </>
      ) : state === "requested" ? (
        <>
          <span className="flex items-center gap-1 group-hover:hidden"><ClockIcon size={14} /> Requested</span>
          <span className="hidden group-hover:inline">Cancel request</span>
        </>
      ) : (
        "Follow"
      )}
    </button>
  );
}
