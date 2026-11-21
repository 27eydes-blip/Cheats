import { get } from "../db";
import { alertUser, pushConfigured, type AlertKind } from "./push";

const KIND: Record<string, AlertKind | undefined> = { reply: "replies", quote: "replies", mention: "mentions", follow: "follows", follow_request: "follows" };

/** Push for a new Newsdesk notification (responses, quotes, mentions, follows). Fire-and-forget. */
export function pushForNotification(userId: string, actorId: string | null, type: string, postId: string | null) {
  const kind = KIND[type];
  if (!kind || !actorId || (!pushConfigured() && !(globalThis as { __pushTransport?: unknown }).__pushTransport)) return;
  const actor = get<{ handle: string }>("SELECT handle FROM users WHERE id = ?", [actorId]);
  if (!actor) return;
  const body = postId ? get<{ body: string }>("SELECT body FROM posts WHERE id = ?", [postId])?.body ?? "" : "";
  const title =
    type === "reply" ? `@${actor.handle} responded` : type === "quote" ? `@${actor.handle} quoted you` : type === "mention" ? `@${actor.handle} mentioned you` : type === "follow" ? `@${actor.handle} followed you` : `@${actor.handle} wants to follow you`;
  const url = postId ? `/p/${postId}` : type === "follow_request" ? "/notifications" : `/u/${actor.handle}`;
  void alertUser(userId, kind, `${type}:${actorId}:${postId ?? ""}`, { title, body: body.slice(0, 140), url, tag: `${type}-${postId ?? actorId}` }).catch((e) => console.error("[push]", e));
}
