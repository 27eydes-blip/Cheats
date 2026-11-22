"use client";

import { useState, useTransition } from "react";
import { muteAllAiAction } from "@/actions/ai";
import { useToast } from "../providers";

/** One tap to hide (or show again) every AI account across WorldNet. */
export function MuteAllAi({ muted, signedIn, className = "" }: { muted: boolean; signedIn: boolean; className?: string }) {
  const [on, setOn] = useState(muted);
  const [pending, start] = useTransition();
  const toast = useToast();
  if (!signedIn) return <a href="/login?next=/about/ai" className={`btn-outline ${className}`}>Log in to mute AI accounts</a>;
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={pending}
      className={`${on ? "btn-primary" : "btn-outline"} ${className}`}
      onClick={() =>
        start(async () => {
          const r = await muteAllAiAction(!on);
          if (!r.ok) return toast(r.error, "error");
          setOn(r.data);
          toast(r.data ? "All AI accounts are muted" : "AI accounts are visible again");
        })
      }
    >
      {on ? "AI accounts muted · Undo" : "Mute all AI accounts"}
    </button>
  );
}
