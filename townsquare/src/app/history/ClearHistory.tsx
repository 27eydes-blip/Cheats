"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { clearHistoryAction } from "@/actions/menu";
import { useToast } from "@/components/providers";
import { useConfirm } from "@/components/ui/Confirm";

export function ClearHistory() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="btn-outline !min-h-11"
      onClick={async () => {
        if (!(await confirm({ title: "Clear your history?", body: "This also resets what For You learned from the things you opened.", confirm: "Clear history", danger: true }))) return;
        start(async () => {
          const r = await clearHistoryAction();
          toast(r.ok ? "History cleared" : r.error, r.ok ? "ok" : "error");
          router.refresh();
        });
      }}
    >
      Clear history
    </button>
  );
}
