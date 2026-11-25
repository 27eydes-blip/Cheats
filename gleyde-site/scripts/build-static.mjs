/**
 * Builds the site as plain static files in out/ for Cloudflare Pages.
 *
 *   npm run build:static                  production build
 *   PREVIEW=1 npm run build:static        same, but tells search engines not
 *                                         to index it (for *.pages.dev previews)
 *
 * Static hosting can't run Next.js route handlers, so src/app/api is moved
 * aside for the build (and always restored). On Pages, /api/contact is
 * served by functions/api/contact.ts instead.
 */
import { execSync } from "node:child_process";
import { existsSync, renameSync, writeFileSync } from "node:fs";

const api = "src/app/api";
const parked = ".api-parked";

if (existsSync(parked)) throw new Error(`${parked} exists: a previous build was interrupted. Move it back to ${api}.`);

renameSync(api, parked);
try {
  execSync("next build", { stdio: "inherit", env: { ...process.env, STATIC_EXPORT: "1" } });
} finally {
  renameSync(parked, api);
}

// Security headers (Next.js sets these itself on Vercel; see next.config.ts).
const security = [
  "X-Content-Type-Options: nosniff",
  "X-Frame-Options: DENY",
  "Referrer-Policy: strict-origin-when-cross-origin",
  "Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Strict-Transport-Security: max-age=63072000; includeSubDomains; preload",
];
if (process.env.PREVIEW === "1") security.push("X-Robots-Tag: noindex");

// Generated images are written without a file extension; label them as PNG.
const png = ["/opengraph-image", "/twitter-image", "/apple-icon"]
  .map((p) => `${p}\n  Content-Type: image/png`)
  .join("\n");

writeFileSync(
  "out/_headers",
  `/*\n${security.map((h) => `  ${h}`).join("\n")}\n\n${png}\n\n/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n`,
);
console.log("Static site written to out/ (with _headers).");
