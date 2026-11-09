import type { MetadataRoute } from "next";
import { APP_CONFIG } from "@/config/app";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_CONFIG.name,
    short_name: APP_CONFIG.shortName,
    description: APP_CONFIG.description,
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: APP_CONFIG.backgroundColor,
    theme_color: APP_CONFIG.themeColor,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Snap notes", url: "/capture?camera=1" }],
  };
}
