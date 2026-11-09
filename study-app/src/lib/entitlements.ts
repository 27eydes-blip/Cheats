import "server-only";
import { limitsFor, type PlanLimits, type UsageKind } from "@/config/plans";
import { HttpError, type DB } from "@/lib/server/api";

/**
 * The one place plan limits are enforced. Today it doubles as abuse
 * protection (daily caps on AI calls); a paid tier just changes the numbers
 * returned by limitsFor().
 */
export async function getLimits(supabase: DB, userId: string): Promise<PlanLimits> {
  const { data } = await supabase.from("profiles").select("plan").eq("id", userId).maybeSingle();
  return limitsFor(data?.plan);
}

export async function assertWithinLimit(supabase: DB, userId: string, kind: UsageKind, units = 1) {
  const limits = await getLimits(supabase, userId);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("usage_events")
    .select("units")
    .eq("owner_id", userId)
    .eq("kind", kind)
    .gte("created_at", since);
  if (error) throw error;
  const used = (data ?? []).reduce((s, r) => s + r.units, 0);
  if (used + units > limits.daily[kind]) {
    throw new HttpError(429, "You've hit today's limit for this. It resets in 24 hours.");
  }
  return limits;
}

export async function recordUsage(supabase: DB, userId: string, kind: UsageKind, units = 1) {
  await supabase.from("usage_events").insert({ owner_id: userId, kind, units });
}
