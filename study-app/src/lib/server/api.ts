import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { AIError } from "@/lib/ai/types";
import type { Database } from "@/lib/supabase/database.types";
import { supabaseServer } from "@/lib/supabase/server";

export type DB = SupabaseClient<Database>;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Resolves the signed-in student or throws 401. */
export async function requireUser(): Promise<{ supabase: DB; user: User }> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Please sign in.");
  return { supabase, user: data.user };
}

/** Wraps a route handler with consistent JSON errors (no internals leaked). */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof AIError) {
        const status = err.code === "rate_limited" ? 429 : err.code === "unavailable" ? 503 : 422;
        return NextResponse.json({ error: err.message, code: err.code }, { status });
      }
      console.error("[api] unexpected error", err);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

export async function readJson<T>(req: Request, parse: (v: unknown) => T): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
  try {
    return parse(body);
  } catch {
    throw new HttpError(400, "Invalid request.");
  }
}
