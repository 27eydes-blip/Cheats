"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { deleteFiles, saveImage } from "@/lib/media";
import { endSession, requireViewer } from "@/lib/session";
import { assertCanAct, changePassword, deleteAccount, updateAccount, updateProfile } from "@/lib/users";
import { AppError } from "@/lib/errors";
import { attempt, type Result } from "./result";

export async function updateProfileAction(_: Result | null, form: FormData): Promise<Result> {
  return attempt(async () => {
    const user = await requireViewer();
    assertCanAct(user);
    const file = (name: string) => {
      const f = form.get(name);
      return f instanceof File && f.size > 0 ? f : null;
    };
    const avatar = file("avatar");
    const banner = file("banner");
    const labels = form.getAll("linkLabel").map(String);
    const links = form
      .getAll("linkUrl")
      .map(String)
      .map((url, i) => ({ label: labels[i] ?? "", url }))
      .filter((l) => l.url.trim());
    updateProfile(
      user.id,
      { displayName: String(form.get("displayName") ?? ""), bio: String(form.get("bio") ?? ""), links },
      {
        avatarId: avatar ? await saveImage(user.id, avatar, "avatar") : form.get("removeAvatar") ? null : undefined,
        bannerId: banner ? await saveImage(user.id, banner, "banner") : form.get("removeBanner") ? null : undefined,
      },
    );
    revalidatePath("/", "layout");
  });
}

export async function updateAccountAction(_: Result | null, form: FormData): Promise<Result> {
  return attempt(async () => {
    const user = await requireViewer();
    updateAccount(user.id, { handle: String(form.get("handle") ?? ""), hideFollows: form.get("hideFollows") === "on" });
    revalidatePath("/", "layout");
  });
}

export async function changePasswordAction(_: Result | null, form: FormData): Promise<Result> {
  return attempt(async () => {
    const user = await requireViewer();
    await changePassword(user.id, String(form.get("current") ?? ""), String(form.get("next") ?? ""));
  });
}

export async function deleteAccountAction(_: Result | null, form: FormData): Promise<Result> {
  const res = await attempt(async () => {
    const user = await requireViewer();
    if (form.get("confirm") !== "DELETE") throw new AppError("Type DELETE to confirm.");
    const files = await deleteAccount(user.id, String(form.get("password") ?? ""));
    if (files) deleteFiles(files);
    await endSession();
  });
  if (res.ok) redirect("/login?deleted=1");
  return res;
}
