"use server";
import { addToWatchlist, removeFromWatchlist } from "@/lib/markets/watchlist";
import { requireViewer } from "@/lib/session";
import { attempt } from "./result";

export async function addWatchAction(symbol: string) {
  return attempt(async () => addToWatchlist((await requireViewer()).id, String(symbol)));
}

export async function removeWatchAction(symbol: string) {
  return attempt(async () => removeFromWatchlist((await requireViewer()).id, String(symbol)));
}
