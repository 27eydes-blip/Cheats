"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { blockAction, muteAction } from "@/actions/social";

export function Unblock({ userId, kind }: { userId: string; kind: "block" | "mute" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="btn-outline min-h-9 px-3 text-sm"
      onClick={() => start(async () => { await (kind === "block" ? blockAction : muteAction)(userId, false); router.refresh(); })}
    >
      {kind === "block" ? "Unblock" : "Unmute"}
    </button>
  );
}
