import { createClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import type { Question } from "@/lib/quiz/schema";
import type { Database } from "@/lib/supabase/database.types";

export interface SharedQuiz {
  id: string;
  title: string;
  share_code: string;
  class_name: string | null;
  topic_name: string | null;
  owner_name: string | null;
  question_count: number;
  types: string[];
  questions: Question[];
}

function anon() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Loads a shared quiz as an anonymous visitor (RLS-safe RPC). */
export async function fetchSharedQuiz(code: string): Promise<SharedQuiz | null> {
  if (!/^[A-Za-z0-9]{4,16}$/.test(code)) return null;
  const { data, error } = await anon().rpc("get_shared_quiz", { code });
  if (error || !data) return null;
  return data as unknown as SharedQuiz;
}

async function cachedSharedQuiz(code: string): Promise<SharedQuiz | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`share:${code.toUpperCase()}`);
  return fetchSharedQuiz(code);
}

/**
 * Cached for a minute so link previews and first loads are instant. A miss is
 * re-checked live, so a quiz that was just shared shows up right away.
 */
export async function getSharedQuiz(code: string): Promise<SharedQuiz | null> {
  return (await cachedSharedQuiz(code)) ?? fetchSharedQuiz(code);
}
