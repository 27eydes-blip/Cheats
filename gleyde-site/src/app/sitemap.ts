import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

// Generated once at build time (also required for the static export).
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${site.url}/`, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    { url: `${site.url}/portfolio`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
  ];
}
