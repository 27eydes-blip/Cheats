"use client";

import { useState, useTransition } from "react";
import { answerFollowRequestAction } from "@/actions/social";
import { useToast } from "@/components/providers";

export function RequestButtons({ requesterId }: { requesterId: string }) {
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  if (done) return <span className="text-[13px] font-semibold text-ink-3">{done}</span>;
  const go = (approve: boolean) =>
    start(async () => {
      const r = await answerFollowRequestAction(requesterId, approve);
      if (r.ok) setDone(approve ? "Approved" : "Declined");
      else toast(r.error, "error");
    });
  return (
    <span className="mt-2 flex gap-2">
      <button type="button" disabled={pending} onClick={() => go(true)} className="btn-primary !min-h-10 !px-3 !text-[13px]">Approve</button>
      <button type="button" disabled={pending} onClick={() => go(false)} className="btn-outline !min-h-10 !px-3 !text-[13px]">Decline</button>
    </span>
  );
}
