"use client";

import { useState } from "react";
import { Vote } from "@/components/community/Vote";
import { useToast } from "@/components/providers";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/Confirm";
import { Menu } from "@/components/ui/Menu";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { Sheet } from "@/components/ui/Sheet";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { EditIcon, FlagIcon, MoreIcon, TrashIcon } from "@/components/icons";

export function DemoControls() {
  const toast = useToast();
  const confirm = useConfirm();
  const [sheet, setSheet] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={() => toast("Saved to bookmarks", "ok", "#")}>Toast</Button>
      <Button variant="secondary" onClick={() => toast("Something went wrong", "error")}>Error toast</Button>
      <Button variant="secondary" onClick={() => setSheet(true)}>Sheet</Button>
      <Button variant="secondary" onClick={async () => toast((await confirm({ title: "Delete this post?", body: "This can't be undone.", confirm: "Delete", danger: true })) ? "Confirmed" : "Cancelled")}>Confirm dialog</Button>
      <Menu label="Demo menu" button={<MoreIcon size={20} />} items={[{ label: "Edit", icon: <EditIcon size={18} />, onSelect: () => {} }, "divider", { label: "Report", icon: <FlagIcon size={18} />, danger: true, onSelect: () => {} }, { label: "Delete", icon: <TrashIcon size={18} />, danger: true, onSelect: () => {} }]} />
      <ThemeToggle />
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Bottom sheet">
        <p className="px-6 pb-6 text-ink-2">On phones this slides up from the bottom; drag the handle down to dismiss. On larger screens it&apos;s a centered dialog.</p>
      </Sheet>
    </div>
  );
}

export function DemoTabs() {
  return (
    <div className="space-y-3">
      <SegmentedTabs active="a" tabs={[{ key: "a", label: "Following", href: "/design" }, { key: "b", label: "For You", href: "/design" }, { key: "c", label: "Breaking", href: "/design" }]} />
      <SegmentedTabs variant="pill" active="hot" className="w-[240px]" tabs={[{ key: "hot", label: "Hot", href: "/design" }, { key: "new", label: "New", href: "/design" }, { key: "top", label: "Top", href: "/design" }]} />
    </div>
  );
}

export function DemoVote() {
  return <div className="flex items-center gap-4"><Vote postId="demo" score={42} myVote={1} /><Vote postId="demo" score={7} myVote={0} horizontal /></div>;
}
