import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;

// Makes D1 + secrets from wrangler.jsonc / .dev.vars available during `next dev`.
initOpenNextCloudflareForDev();
