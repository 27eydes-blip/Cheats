import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // One canonical host: access cookies are per-host, and QR codes/emails use the bare domain.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.coastpassgo.com" }],
        destination: "https://coastpassgo.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

// Makes D1 + secrets from wrangler.jsonc / .dev.vars available during `next dev`.
initOpenNextCloudflareForDev();
