"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { blockAction, muteAction } from "@/actions/social";
import { BlockIcon, FlagIcon, LinkIcon, MoreIcon, MuteIcon } from "@/components/icons";
import { Menu } from "@/components/Menu";
import { useToast } from "@/components/providers";
import { ReportDialog } from "@/components/ReportDialog";

export function ProfileMenu({ userId, handle, blocked, muted }: { userId: string; handle: string; blocked: boolean; muted: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [reporting, setReporting] = useState(false);
  const [, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? msg : (r.error ?? "Error"), r.ok ? "ok" : "error");
      router.refresh();
    });
  return (
    <div className="rounded-full border border-line">
      <Menu
        label={`More options for @${handle}`}
        button={<MoreIcon />}
        items={[
          { label: "Copy profile link", icon: <LinkIcon size={18} />, onSelect: () => navigator.clipboard?.writeText(`${location.origin}/u/${handle}`).then(() => toast("Link copied")) },
          { label: muted ? `Unmute @${handle}` : `Mute @${handle}`, icon: <MuteIcon size={18} />, onSelect: () => run(() => muteAction(userId, !muted), muted ? "Unmuted" : "Muted") },
          {
            label: blocked ? `Unblock @${handle}` : `Block @${handle}`,
            icon: <BlockIcon size={18} />,
            onSelect: () => (blocked || confirm(`Block @${handle}? This also removes follows between you.`)) && run(() => blockAction(userId, !blocked), blocked ? "Unblocked" : "Blocked"),
          },
          "divider",
          { label: `Report @${handle}`, danger: true, icon: <FlagIcon size={18} />, onSelect: () => setReporting(true) },
        ]}
      />
      {reporting && <ReportDialog open onClose={() => setReporting(false)} targetType="user" targetId={userId} label={`@${handle}`} />}
    </div>
  );
}
