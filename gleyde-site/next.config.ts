import type { NextConfig } from "next";

/**
 * Baseline security headers. They cost nothing and help the site score well
 * on security scanners (fitting for a company with a cybersecurity division).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

/**
 * STATIC_EXPORT=1 (set by `npm run build:static`) builds a plain static site
 * into out/ for Cloudflare Pages. Headers then come from out/_headers, which
 * the build script writes, instead of from Next.js.
 */
const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  ...(staticExport
    ? { output: "export" }
    : {
        async headers() {
          return [{ source: "/:path*", headers: securityHeaders }];
        },
      }),
};

export default nextConfig;
