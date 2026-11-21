"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { reviewNoteAction } from "@/actions/notes";
import { useToast } from "@/components/providers";
import { Button } from "@/components/ui/Button";

export function ReviewButtons({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const go = (a: "remove" | "dismiss") => start(async () => {
    const r = await reviewNoteAction(id, a);
    toast(r.ok ? (a === "remove" ? "Note removed" : "Reports dismissed") : r.error, r.ok ? "ok" : "error");
    router.refresh();
  });
  return (
    <div className="mt-2 flex gap-2">
      <Button size="sm" variant="danger" disabled={pending} onClick={() => go("remove")}>Remove note</Button>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => go("dismiss")}>Dismiss reports</Button>
    </div>
  );
}
