"use server";
import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/session";
import { deleteSponsor, saveSponsor, setAdsEnabled, setSponsorActive } from "@/lib/ads";
import { AppError } from "@/lib/errors";
import { attempt } from "./result";

const date = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) throw new AppError("That date isn't valid.");
  return t;
};
const done = () => (revalidatePath("/admin/sponsors"), revalidatePath("/", "layout"));

export async function saveSponsorAction(form: FormData) {
  return attempt(async () => {
    const u = await requireViewer();
    const f = form.get("image");
    const image = f instanceof File && f.size > 0 ? Buffer.from(await f.arrayBuffer()) : null;
    if (f instanceof File && f.size > 5 * 1024 * 1024) throw new AppError("Images must be 5 MB or smaller.");
    const id = await saveSponsor(u, String(form.get("id") ?? "") || null, {
      name: String(form.get("name") ?? ""), headline: String(form.get("headline") ?? ""), body: String(form.get("body") ?? ""), url: String(form.get("url") ?? ""),
      button: String(form.get("button") ?? ""), alt: String(form.get("alt") ?? ""), startsAt: date(form.get("startsAt")), endsAt: date(form.get("endsAt")),
      active: form.get("active") === "on" || form.get("active") === "1", image, removeImage: form.get("removeImage") === "1",
    });
    done();
    return id;
  });
}
export async function deleteSponsorAction(id: string) {
  return attempt(async () => {
    deleteSponsor(await requireViewer(), String(id));
    done();
  });
}
export async function sponsorActiveAction(id: string, on: boolean) {
  return attempt(async () => {
    setSponsorActive(await requireViewer(), String(id), !!on);
    done();
  });
}
export async function sponsorsEnabledAction(on: boolean) {
  return attempt(async () => {
    setAdsEnabled(await requireViewer(), !!on);
    done();
  });
}
