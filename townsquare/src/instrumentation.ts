/** Runs once when the Next.js server starts: start the news scheduler and register alert hooks (Node runtime only). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { startNewsScheduler } = await import("./lib/newsroom/scheduler");
  startNewsScheduler();
}
