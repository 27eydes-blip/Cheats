import { EventEmitter } from "node:events";

/**
 * In-process event bus for live updates, streamed to browsers over
 * Server-Sent Events (/api/stream). Only public facts go out: stance counts
 * (never who voted), the id of a new public Story take, and "the wire changed".
 *
 * One server process = one bus. When the app runs on several instances, swap
 * this for Supabase Realtime or Redis pub/sub behind the same publish() call.
 */
export type LiveEvent =
  | { type: "stance"; target: "story" | "post"; id: string; agree: number; disagree: number; unsure: number; total: number }
  | { type: "take"; storyKey: string; postId: string }
  | { type: "wire" };

const g = globalThis as unknown as { __liveBus?: EventEmitter };
export const bus = (g.__liveBus ??= new EventEmitter().setMaxListeners(0));

export function publish(e: LiveEvent) {
  bus.emit("event", e);
}
