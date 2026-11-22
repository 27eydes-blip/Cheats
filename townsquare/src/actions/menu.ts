"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addSponsoredCard, removeSponsoredCard, setAdsEnabled } from "@/lib/ads";
import { addFeedTab, removeFeedTab } from "@/lib/feedtabs";
import { clearHistory } from "@/lib/history";
import { addListMember, createList, deleteList, removeListMember } from "@/lib/lists";
import { sendMessage } from "@/lib/messages";
import { endSession, requireViewer } from "@/lib/session";
import { attempt } from "./result";

export async function feedTabAction(kind: "topic" | "team", key: string, on: boolean) {
  return attempt(async () => {
    const u = await requireViewer();
    if (on) addFeedTab(u.id, String(kind), String(key).slice(0, 40));
    else removeFeedTab(u.id, String(kind), String(key).slice(0, 40));
    revalidatePath("/");
  });
}

export async function sendMessageAction(recipientId: string, body: string) {
  return attempt(async () => sendMessage(await requireViewer(), String(recipientId), String(body)));
}

export async function createListAction(name: string) {
  return attempt(async () => {
    const id = createList(await requireViewer(), String(name));
    revalidatePath("/lists");
    return id;
  });
}

export async function deleteListAction(listId: string) {
  return attempt(async () => {
    deleteList(await requireViewer(), String(listId));
    revalidatePath("/lists");
  });
}

export async function listMemberAction(listId: string, who: string, on: boolean) {
  return attempt(async () => {
    const u = await requireViewer();
    if (on) addListMember(u, String(listId), String(who));
    else removeListMember(u, String(listId), String(who));
    revalidatePath(`/lists/${listId}`);
  });
}

export async function clearHistoryAction() {
  return attempt(async () => {
    clearHistory((await requireViewer()).id);
    revalidatePath("/history");
  });
}

export async function adsEnabledAction(on: boolean) {
  return attempt(async () => {
    setAdsEnabled(await requireViewer(), !!on);
    revalidatePath("/", "layout");
  });
}

export async function sponsoredCardAction(form: FormData) {
  return attempt(async () => {
    const u = await requireViewer();
    if (form.get("remove")) removeSponsoredCard(u, String(form.get("remove")));
    else await addSponsoredCard(u, { sponsor: String(form.get("sponsor") ?? ""), title: String(form.get("title") ?? ""), body: String(form.get("body") ?? ""), url: String(form.get("url") ?? "") });
    revalidatePath("/", "layout");
  });
}

/** "Switch account": sign out here and go to the sign-in screen. */
export async function switchAccountAction() {
  await endSession();
  redirect("/login?switch=1");
}
