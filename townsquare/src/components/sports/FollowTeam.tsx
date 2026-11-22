"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { feedTabAction } from "@/actions/menu";
import { useToast } from "../providers";

/** Add or remove a team from My Teams (the same list as Your Topics in the menu). */
export function FollowTeam({ teamId, name, following, signedIn }: { teamId: string; name: string; following: boolean; signedIn: boolean }) {
  const [on, setOn] = useState(following);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  if (!signedIn) return <a href={`/login?next=/sports/${teamId}`} className="btn-outline !min-h-11">Log in to follow</a>;
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={pending}
      className={`${on ? "btn-outline" : "btn-primary"} !min-h-11`}
      onClick={() =>
        start(async () => {
          const r = await feedTabAction("team", teamId, !on);
          if (!r.ok) return toast(r.error, "error");
          setOn(!on);
          toast(on ? `${name} removed from My Teams` : `${name} added to My Teams`);
          router.refresh();
        })
      }
    >
      {on ? "In My Teams ✓" : "Add to My Teams"}
    </button>
  );
}
