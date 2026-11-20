import { userMessage } from "@/lib/errors";

export type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/** Run a server-action body and turn thrown errors into a safe, displayable message. */
export async function attempt<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    // Let Next.js redirects/not-found propagate.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    return { ok: false, error: userMessage(e) };
  }
}
