import path from "node:path";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // This app lives inside a larger repo; trace files from here.
  outputFileTracingRoot: path.join(__dirname),
  // sharp is a native module; keep it out of the server bundle.
  serverExternalPackages: ["sharp"],
  // Render <title>/<meta> in <head> for every client (not streamed into <body>).
  htmlLimitedBots: /.*/,
  experimental: {
    // Room for 4 images (each capped at 8 MB before re-encoding) in one post.
    serverActions: { bodySizeLimit: "36mb" },
  },
  // The old topic feeds for sections that now have their own pages.
  async redirects() {
    return ["politics", "world", "business", "tech", "culture"].map((slug) => ({ source: `/topics/${slug}`, destination: `/${slug}`, permanent: true }));
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
