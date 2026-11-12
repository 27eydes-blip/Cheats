// Hand-written env types. Regenerate with `npm run cf-typegen` if you add bindings.
import type { D1Database, Fetcher } from "@cloudflare/workers-types";

declare global {
interface CloudflareEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  PUBLIC_BASE_URL: string;
  BRAND_NAME: string;
  SUPPORT_EMAIL: string;
  FROM_EMAIL: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  ACCESS_TOKEN_SECRET: string;
  ADMIN_PASSWORD: string;
  RESEND_API_KEY?: string;
  APPLE_PAY_DOMAIN_ASSOCIATION?: string;
  OPEN_METEO_API_KEY?: string;
}
}
