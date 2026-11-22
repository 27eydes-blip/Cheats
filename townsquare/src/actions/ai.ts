"use server";
import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { approveAiPost, deleteAiPost, rejectAiPost, setAiMuted, setAiSettings, updateAccount } from "@/lib/ai/newsroom";
import { clearAiAvatar, saveAiAvatar } from "@/lib/ai/avatars";
import { runAiNow } from "@/lib/ai/scheduler";
import { rateLimit } from "@/lib/ratelimit";
import { attempt } from "./result";

async function admin() {
  const u = await requireViewer();
  if (u.role !== "admin") throw new AppError("Admins only.", "forbidden");
  return u;
}
const done = () => (revalidatePath("/admin/ai"), revalidatePath("/", "layout"));

/** Readers: one tap to mute (or unmute) every AI account. */
export async function muteAllAiAction(on: boolean) {
  return attempt(async () => {
    const u = await requireViewer();
    rateLimit("aiMute", u.id);
    setAiMuted(u.id, !!on);
    revalidatePath("/", "layout");
    return !!on;
  });
}

export async function aiKillSwitchAction(on: boolean) {
  return attempt(async () => {
    await admin();
    setAiSettings({ enabled: !!on });
    console.log(`[ai] newsroom switched ${on ? "ON" : "OFF"} in the Control Room`);
    done();
  });
}

export async function aiApprovalModeAction(mode: "auto" | "manual") {
  return attempt(async () => {
    await admin();
    setAiSettings({ approval: mode === "manual" ? "manual" : "auto" });
    done();
  });
}

export async function aiAccountAction(userId: string, patch: { paused?: boolean; style?: string; hours?: string; maxPerHour?: number }) {
  return attempt(async () => {
    await admin();
    updateAccount(String(userId), {
      paused: patch.paused === undefined ? undefined : !!patch.paused,
      style: patch.style === undefined ? undefined : String(patch.style),
      hours: patch.hours === undefined ? undefined : String(patch.hours),
      maxPerHour: patch.maxPerHour === undefined ? undefined : Number(patch.maxPerHour),
    });
    done();
  });
}

export async function aiAvatarAction(form: FormData) {
  return attempt(async () => {
    await admin();
    const handle = String(form.get("handle") ?? "");
    if (form.get("clear") === "1") await clearAiAvatar(handle);
    else {
      const f = form.get("image");
      if (!(f instanceof File) || !f.size) throw new AppError("Choose an image first.");
      await saveAiAvatar(handle, Buffer.from(await f.arrayBuffer()));
    }
    done();
  });
}

export async function aiDecisionAction(aiPostId: string, decision: "approve" | "reject" | "delete") {
  return attempt(async () => {
    const u = await admin();
    const id = String(aiPostId);
    if (decision === "approve") approveAiPost(id, u.id);
    else if (decision === "reject") rejectAiPost(id, u.id);
    else deleteAiPost(id, u.id);
    done();
  });
}

export async function aiRunNowAction() {
  return attempt(async () => {
    await admin();
    const r = await runAiNow();
    done();
    return r.skipped ? r.skipped : `${r.posted} posted, ${r.queued} queued, ${r.blocked} blocked across ${r.accounts.length} desk${r.accounts.length === 1 ? "" : "s"} ($${r.spentUsd.toFixed(3)}).`;
  });
}
