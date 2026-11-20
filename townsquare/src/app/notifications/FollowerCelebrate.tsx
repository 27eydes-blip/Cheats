"use client";

import { useEffect } from "react";
import { celebrate } from "@/components/Celebrate";

/** A little glow + confetti the first time you open the Newsdesk with new followers. */
export function FollowerCelebrate({ text, id }: { text: string; id: string }) {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(`cel:${id}`)) return;
      sessionStorage.setItem(`cel:${id}`, "1");
    } catch {}
    const t = setTimeout(() => celebrate({ kind: "follower", text }), 400);
    return () => clearTimeout(t);
  }, [text, id]);
  return null;
}
