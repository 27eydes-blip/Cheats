import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Bindings + vars + secrets from wrangler.jsonc / `wrangler secret` / .dev.vars */
export async function getEnv(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as CloudflareEnv;
}

export async function getDB() {
  return (await getEnv()).DB;
}

export function baseUrl(env: CloudflareEnv): string {
  return (env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
}
