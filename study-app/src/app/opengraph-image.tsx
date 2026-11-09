import { ImageResponse } from "next/og";
import { APP_CONFIG } from "@/config/app";
import { OG_SIZE, OgFrame, ogFonts } from "@/lib/og";

export const alt = APP_CONFIG.tagline;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(<OgFrame eyebrow="Reads even messy handwriting" title="Snap your notes. Get a quiz in seconds." chips={[]} cta="Try it free →" />, {
    ...OG_SIZE,
    fonts: await ogFonts(),
  });
}
