"use server";
import { muteTopic, notInterested, showMore, trackEvents, type Target, type TrackEvent } from "@/lib/interests";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp, getViewer, requireViewer } from "@/lib/session";
import { attempt } from "./result";

const target = (t: Target): Target => ({ type: t?.type === "story" ? "story" : "post", id: String(t?.id ?? "").slice(0, 64) });

export async function notInterestedAction(t: Target) {
  return attempt(async () => notInterested((await requireViewer()).id, target(t)));
}

export async function showMoreAction(t: Target) {
  return attempt(async () => showMore((await requireViewer()).id, target(t)));
}

export async function muteTopicAction(topic: string, on: boolean) {
  return attempt(async () => muteTopic((await requireViewer()).id, String(topic), !!on));
}

/** Batched views / clicks / time-on-card from the feed. Rate-limited per viewer (or IP when logged out). */
export async function trackAction(events: TrackEvent[]) {
  return attempt(async () => {
    const viewer = await getViewer();
    rateLimit("track", viewer?.id ?? `ip:${await clientIp()}`);
    trackEvents(viewer?.id ?? null, Array.isArray(events) ? events : []);
  });
}
