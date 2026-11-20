"use server";
import { revalidatePath } from "next/cache";
import { fileReport, moderate, setBanner, type ModAction } from "@/lib/moderation";
import { requireViewer } from "@/lib/session";
import { safeHttpUrl } from "@/lib/text";
import { attempt } from "./result";

export async function reportAction(input: { targetType: "post" | "user"; targetId: string; reason: string; details: string }) {
  return attempt(async () => fileReport(await requireViewer(), input as never));
}

export async function moderateAction(input: { targetType: "post" | "user"; targetId: string; action: ModAction; note?: string; suspendDays?: number }) {
  return attempt(async () => {
    moderate(await requireViewer(), input);
    revalidatePath("/", "layout");
  });
}

export async function setBannerAction(form: FormData) {
  return attempt(async () => {
    const admin = await requireViewer();
    const text = String(form.get("text") ?? "");
    const url = String(form.get("url") ?? "").trim();
    const level = (["breaking", "alert", "info"].includes(String(form.get("level"))) ? form.get("level") : "breaking") as "breaking";
    // Internal paths (e.g. /news/story/infrastructure) or full http(s) links only.
    const safeUrl = url.startsWith("/") && !url.startsWith("//") && !url.includes("\\") ? url.slice(0, 200) : url ? safeHttpUrl(url) : null;
    setBanner(admin, form.get("clear") ? null : { text, url: safeUrl, level });
    revalidatePath("/", "layout");
  });
}
