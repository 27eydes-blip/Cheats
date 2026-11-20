import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // sharp is a native module; keep it out of the server bundle.
  serverExternalPackages: ["sharp"],
  experimental: {
    // Room for 4 images (each capped at 8 MB before re-encoding) in one post.
    serverActions: { bodySizeLimit: "36mb" },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
