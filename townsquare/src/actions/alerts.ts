"use server";
import { revalidatePath } from "next/cache";
import { all } from "@/lib/db";
import { requireViewer } from "@/lib/session";
import { sendTo, setAlertPrefs, type AlertPrefs, type SubRow } from "@/lib/push/push";
import { breakingPreview, sendBreaking } from "@/lib/push/news-alerts";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/ratelimit";
import { attempt } from "./result";

export async function saveAlertPrefsAction(p: Partial<AlertPrefs>) {
  return attempt(async () => {
    const u = await requireViewer();
    const clean: Partial<AlertPrefs> = {};
    for (const k of ["breaking", "replies", "mentions", "follows", "following"] as const) if (k in p) clean[k] = !!p[k];
    if ("quietStart" in p) clean.quietStart = p.quietStart === null ? null : Number(p.quietStart);
    if ("quietEnd" in p) clean.quietEnd = p.quietEnd === null ? null : Number(p.quietEnd);
    if (typeof p.tz === "string") clean.tz = p.tz.slice(0, 64);
    if ("breakingCap" in p) clean.breakingCap = Number(p.breakingCap);
    setAlertPrefs(u.id, clean);
    revalidatePath("/settings/alerts");
  });
}

/** Send a test alert to your own devices (ignores quiet hours, so you can check it works). */
export async function testAlertAction() {
  return attempt(async () => {
    const u = await requireViewer();
    rateLimit("message", `pushtest:${u.id}`);
    const subs = all<SubRow>("SELECT * FROM push_subscriptions WHERE user_id = ?", [u.id]);
    if (!subs.length) throw new AppError("Turn on alerts on this device first.");
    let ok = 0;
    for (const s of subs) if ((await sendTo(s, { title: "WorldNet News", body: "Alerts are working on this device.", url: "/settings/alerts", tag: "test" })) === "sent") ok++;
    return ok;
  });
}

export async function previewBreakingAction(input: { storyKey?: string; title?: string; body?: string; url?: string }) {
  return attempt(async () => {
    const u = await requireViewer();
    if (u.role !== "admin") throw new AppError("Editors only.", "forbidden");
    return breakingPreview(input);
  });
}

export async function sendBreakingAction(input: { storyKey?: string; title?: string; body?: string; url?: string }) {
  return attempt(async () => {
    const r = await sendBreaking(await requireViewer(), input);
    revalidatePath("/admin/alerts");
    return r;
  });
}
