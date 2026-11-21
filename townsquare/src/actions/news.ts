"use server";
import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/session";
import { addSource, removeSource, setDemoData, setSourceActive, setStoryHeadline, syncNow, testSource, updateSource } from "@/lib/newsroom/admin";
import { attempt } from "./result";

const done = () => revalidatePath("/admin/news");

export async function addSourceAction(form: FormData) {
  return attempt(async () => {
    const id = addSource(await requireViewer(), {
      name: String(form.get("name") ?? ""), homepage: String(form.get("homepage") ?? ""), feedUrl: String(form.get("feedUrl") ?? ""), lean: String(form.get("lean") ?? ""),
      note: String(form.get("note") ?? ""), category: String(form.get("category") ?? ""), type: String(form.get("type") ?? ""), color: String(form.get("color") ?? ""),
    });
    done();
    return id;
  });
}
export async function removeSourceAction(id: string) {
  return attempt(async () => {
    const r = removeSource(await requireViewer(), String(id));
    done();
    return r;
  });
}
export async function sourceActiveAction(id: string, on: boolean) {
  return attempt(async () => {
    setSourceActive(await requireViewer(), String(id), !!on);
    done();
  });
}
export async function updateSourceAction(id: string, input: { lean: string; note: string; feedUrl?: string }) {
  return attempt(async () => {
    updateSource(await requireViewer(), String(id), { lean: String(input.lean ?? ""), note: String(input.note ?? ""), feedUrl: input.feedUrl === undefined ? undefined : String(input.feedUrl) });
    done();
    revalidatePath("/", "layout");
  });
}
export async function testSourceAction(idOrUrl: string) {
  return attempt(async () => testSource(await requireViewer(), String(idOrUrl)));
}
export async function syncNowAction(sourceId?: string) {
  return attempt(async () => {
    const r = await syncNow(await requireViewer(), sourceId ? String(sourceId) : undefined);
    revalidatePath("/", "layout");
    return r;
  });
}
export async function demoDataAction(on: boolean) {
  return attempt(async () => {
    setDemoData(await requireViewer(), !!on);
    revalidatePath("/", "layout");
  });
}
export async function storyHeadlineAction(key: string, title: string) {
  return attempt(async () => {
    setStoryHeadline(await requireViewer(), String(key), String(title));
    revalidatePath("/", "layout");
  });
}
