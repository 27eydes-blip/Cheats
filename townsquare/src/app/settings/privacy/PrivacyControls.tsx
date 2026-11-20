"use client";

import { useState, useTransition } from "react";
import { answerFollowRequestAction } from "@/actions/social";
import { setPrivateAction } from "@/actions/settings";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/providers";
import type { UserListItem } from "@/lib/social";

export function PrivateToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <label className="mt-3 flex min-h-12 cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block font-semibold">Private account</span>
        <span className="block text-[13px] text-ink-3">Only followers you approve see your dispatches, follower lists and Boosted tab. Turning this off approves pending requests.</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          start(async () => {
            const r = await setPrivateAction(next);
            if (!r.ok) (setOn(!next), toast(r.error, "error"));
            else toast(next ? "Your account is private" : "Your account is public");
          });
        }}
        className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-white/15 ring-1 ring-rule transition-all before:block before:h-5 before:w-5 before:translate-x-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-[var(--wn-blue-fill)] checked:before:translate-x-[22px]"
      />
    </label>
  );
}

export function FollowRequests({ initial }: { initial: UserListItem[] }) {
  const [list, setList] = useState(initial);
  const [, start] = useTransition();
  const toast = useToast();
  if (!list.length) return <p className="mt-1 text-sm text-ink-3">No pending requests.</p>;
  const answer = (id: string, approve: boolean) => {
    const prev = list;
    setList(list.filter((x) => x.id !== id));
    start(async () => {
      const r = await answerFollowRequestAction(id, approve);
      if (!r.ok) (setList(prev), toast(r.error, "error"));
      else toast(approve ? "Approved" : "Declined");
    });
  };
  return (
    <ul className="mt-2 space-y-2">
      {list.map((u) => (
        <li key={u.id} className="flex items-center gap-3">
          <Avatar url={u.avatarUrl} name={u.displayName} handle={u.handle} size={40} />
          <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{u.displayName}</span><span className="block truncate text-[13px] text-ink-3">@{u.handle}</span></span>
          <button type="button" onClick={() => answer(u.id, true)} className="btn-primary !min-h-10 !px-3 !text-[13px]">Approve</button>
          <button type="button" onClick={() => answer(u.id, false)} className="btn-outline !min-h-10 !px-3 !text-[13px]">Decline</button>
        </li>
      ))}
    </ul>
  );
}
