"use server";
import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { syncAllSports } from "@/lib/sports/games";
import { attempt } from "./result";

/** Control Room: fetch schedules, scores and standings for every league now. */
export async function sportsSyncAction() {
  return attempt(async () => {
    const u = await requireViewer();
    if (u.role !== "admin") throw new AppError("Admins only.", "forbidden");
    const r = await syncAllSports({ pauseMs: 1_200 });
    revalidatePath("/admin");
    revalidatePath("/sports", "layout");
    if (r.skipped) return "A sync is already running.";
    const games = r.results.reduce((n, x) => n + x.games, 0);
    const bad = r.results.filter((x) => !x.ok).map((x) => x.league);
    return `${games} games updated${bad.length ? `; failed: ${bad.join(", ")}` : ""}.`;
  });
}
