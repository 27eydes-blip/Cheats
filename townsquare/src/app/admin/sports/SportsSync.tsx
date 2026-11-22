"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { sportsSyncAction } from "@/actions/sports";
import { useToast } from "@/components/providers";

export function SportsSyncButton() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn-outline mt-3 !min-h-10 !text-[14px]"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await sportsSyncAction();
          toast(r.ok ? r.data : r.error, r.ok ? undefined : "error");
          router.refresh();
        })
      }
    >
      {pending ? "Syncing… (about 20 seconds)" : "Sync now"}
    </button>
  );
}
